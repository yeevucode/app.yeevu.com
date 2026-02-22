/**
 * Blacklist Check (RBL)
 *
 * Purpose: Check if domain's mail server IPs are listed on DNS-based blacklists
 * Uses the rbl-check.org API for comprehensive blacklist checking
 */

import { promises as dns } from 'dns';
import { CheckResult } from '../types/scanner';
import type { ReputationTier } from '../constants/scoring';

interface RblEntry {
  name: string;
  host: string;
  website: string;
  status: 'listed' | 'notlisted' | 'error';
}

interface IpCheckResult {
  ip: string;
  hostname?: string;
  blacklists: RblEntry[];
  listedCount: number;
  totalChecked: number;
}

// Major blacklists that have higher weight in scoring
const MAJOR_BLACKLISTS = [
  'spamhaus',
  'barracuda',
  'spamcop',
  'sorbs',
  'nixspam',
];

/**
 * Parse the RBL API response
 * Format: name;host;website;status (one per line)
 */
function parseRblResponse(responseText: string): RblEntry[] {
  const entries: RblEntry[] = [];
  const lines = responseText.trim().split('\n');

  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length >= 4) {
      const [name, host, website, statusStr] = parts;
      entries.push({
        name: name.trim(),
        host: host.trim(),
        website: website.trim() === 'nowebsite' ? '' : website.trim(),
        status: statusStr.trim() === 'listed' ? 'listed' : 'notlisted',
      });
    }
  }

  return entries;
}

/**
 * Check a single IP against blacklists using the RBL API
 */
async function checkIpBlacklists(ip: string, hostname?: string): Promise<IpCheckResult> {
  try {
    const response = await fetch(`https://rbl-check.org/rbl_api.php?ipaddress=${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`RBL API returned status ${response.status}`);
    }

    const text = await response.text();
    const blacklists = parseRblResponse(text);
    const listedCount = blacklists.filter(b => b.status === 'listed').length;

    return {
      ip,
      hostname,
      blacklists,
      listedCount,
      totalChecked: blacklists.length,
    };
  } catch (error) {
    // Return empty result on error
    return {
      ip,
      hostname,
      blacklists: [],
      listedCount: 0,
      totalChecked: 0,
    };
  }
}

/**
 * Get mail server IPs for a domain
 */
async function getMailServerIps(domain: string): Promise<Array<{ ip: string; hostname: string }>> {
  const ips: Array<{ ip: string; hostname: string }> = [];

  try {
    // Get MX records
    const mxRecords = await dns.resolveMx(domain);

    // Sort by priority and take top 2
    mxRecords.sort((a, b) => a.priority - b.priority);
    const topMx = mxRecords.slice(0, 2);

    // Resolve each MX hostname to IPs
    for (const mx of topMx) {
      try {
        const addresses = await dns.resolve4(mx.exchange);
        // Only take first IP per MX to limit API calls
        if (addresses.length > 0) {
          ips.push({ ip: addresses[0], hostname: mx.exchange });
        }
      } catch {
        // Couldn't resolve this MX, skip
      }
    }
  } catch {
    // No MX records, try A record fallback
    try {
      const addresses = await dns.resolve4(domain);
      if (addresses.length > 0) {
        ips.push({ ip: addresses[0], hostname: domain });
      }
    } catch {
      // No A records either
    }
  }

  return ips;
}

/**
 * Check if a blacklist is considered "major"
 */
function isMajorBlacklist(entry: RblEntry): boolean {
  const lowerName = entry.name.toLowerCase();
  const lowerHost = entry.host.toLowerCase();
  return MAJOR_BLACKLISTS.some(major =>
    lowerName.includes(major) || lowerHost.includes(major)
  );
}

export async function checkBlacklist(domain: string): Promise<CheckResult> {
  try {
    // Get mail server IPs
    const mailServerIps = await getMailServerIps(domain);

    if (mailServerIps.length === 0) {
      return {
        status: 'fail',
        score: 0,
        details: {
          error: 'Could not resolve any mail server IPs for this domain',
          ips_checked: 0,
        },
        recommendations: [
          'Ensure domain has valid MX records or A records',
          'Check DNS configuration',
        ],
      };
    }

    // Check each IP in parallel — worst case drops from N×30s to 30s
    const ipResults = await Promise.all(
      mailServerIps.map(({ ip, hostname }) => checkIpBlacklists(ip, hostname))
    );

    // Analyze results
    const totalListings = ipResults.reduce((sum, r) => sum + r.listedCount, 0);
    const totalChecked = ipResults.reduce((sum, r) => sum + r.totalChecked, 0);

    // Find major blacklist listings
    const majorListings: Array<{ ip: string; blacklist: RblEntry }> = [];
    const minorListings: Array<{ ip: string; blacklist: RblEntry }> = [];

    for (const ipResult of ipResults) {
      for (const bl of ipResult.blacklists) {
        if (bl.status === 'listed') {
          if (isMajorBlacklist(bl)) {
            majorListings.push({ ip: ipResult.ip, blacklist: bl });
          } else {
            minorListings.push({ ip: ipResult.ip, blacklist: bl });
          }
        }
      }
    }

    // Calculate score
    let score = 100;
    // Major blacklists: -15 points each (capped at -60)
    score -= Math.min(majorListings.length * 15, 60);
    // Minor blacklists: -5 points each (capped at -30)
    score -= Math.min(minorListings.length * 5, 30);
    score = Math.max(0, score);

    // Determine status and reputation tier
    let status: 'pass' | 'warn' | 'fail';
    let reputation_tier: ReputationTier;
    if (majorListings.length >= 2) {
      status = 'fail';
      reputation_tier = 'multi_major';
    } else if (majorListings.length === 1) {
      status = 'fail';
      reputation_tier = 'major';
    } else if (minorListings.length > 0) {
      status = 'warn';
      reputation_tier = 'minor_only';
    } else {
      status = 'pass';
      reputation_tier = 'clean';
    }

    // Build recommendations
    const recommendations: string[] = [];

    if (majorListings.length > 0) {
      recommendations.push(
        `CRITICAL: Found ${majorListings.length} major blacklist listing(s). This will severely impact email deliverability.`
      );
      for (const { ip, blacklist } of majorListings.slice(0, 3)) {
        if (blacklist.website) {
          recommendations.push(
            `${blacklist.name} listing for ${ip}: Visit ${blacklist.website} to request removal`
          );
        } else {
          recommendations.push(
            `${blacklist.name} listing for ${ip}: Contact the blacklist operator to request removal`
          );
        }
      }
    }

    if (minorListings.length > 0 && majorListings.length === 0) {
      recommendations.push(
        `Found ${minorListings.length} minor blacklist listing(s). Monitor and request delisting if affecting deliverability.`
      );
    }

    if (totalListings > 0) {
      recommendations.push(
        'Review your mail server configuration and sending practices',
        'Ensure proper SPF, DKIM, and DMARC records are in place',
        'Monitor your IP reputation regularly'
      );
    }

    return {
      status,
      score,
      details: {
        reputation_tier,
        ips_checked: mailServerIps.length,
        blacklists_checked: totalChecked,
        total_listings: totalListings,
        major_listings: majorListings.length,
        minor_listings: minorListings.length,
        ip_results: ipResults.map(r => ({
          ip: r.ip,
          hostname: r.hostname,
          listed_count: r.listedCount,
          total_checked: r.totalChecked,
          listings: r.blacklists
            .filter(b => b.status === 'listed')
            .map(b => ({
              name: b.name,
              host: b.host,
              website: b.website,
              major: isMajorBlacklist(b),
            })),
        })),
        all_clear: totalListings === 0,
      },
      recommendations,
    };

  } catch (error) {
    return {
      status: 'fail',
      score: 0,
      details: {
        check_error: true,
        reputation_tier: 'unknown' as ReputationTier,
        error: String(error),
        note: 'Blacklist check unavailable',
      },
      recommendations: [
        'Blacklist check could not be completed — no score penalty applied',
        'Try again later or check manually at https://rbl-check.org/',
      ],
    };
  }
}
