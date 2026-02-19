/**
 * SPF Record Check
 *
 * Purpose: Validate SPF record syntax, policy, and recursive lookup count
 * Note: SPF has a limit of 10 DNS lookups (RFC 7208)
 * We recursively count include:, a, mx, ptr, exists mechanisms
 * IP addresses (ip4:, ip6:) do not count as lookups
 */

import { promises as dns } from 'dns';
import { CheckResult } from '../types/scanner';

interface SpfLookupResult {
  domain: string;
  record: string;
  lookups: string[];
}

/**
 * Count DNS lookup mechanisms in an SPF record
 * Returns mechanisms that require DNS lookups (not IP addresses)
 */
function countLookupMechanisms(spfRecord: string): string[] {
  const tokens = spfRecord.split(/\s+/);
  const lookupMechanisms: string[] = [];

  for (const token of tokens) {
    // Skip version tag and IP mechanisms
    if (token.startsWith('v=spf1')) continue;
    if (token.startsWith('ip4:')) continue;
    if (token.startsWith('ip6:')) continue;
    if (token.startsWith('+ip4:')) continue;
    if (token.startsWith('+ip6:')) continue;
    if (token.startsWith('-ip4:')) continue;
    if (token.startsWith('-ip6:')) continue;
    if (token.startsWith('~ip4:')) continue;
    if (token.startsWith('~ip6:')) continue;
    if (token.startsWith('?ip4:')) continue;
    if (token.startsWith('?ip6:')) continue;

    // Count mechanisms that require DNS lookups
    if (/^(\+|-|~|\?)?include:/i.test(token)) {
      lookupMechanisms.push(token);
    } else if (/^(\+|-|~|\?)?a(\b|:)/i.test(token)) {
      lookupMechanisms.push(token);
    } else if (/^(\+|-|~|\?)?mx(\b|:)/i.test(token)) {
      lookupMechanisms.push(token);
    } else if (/^(\+|-|~|\?)?ptr(\b|:)/i.test(token)) {
      lookupMechanisms.push(token);
    } else if (/^(\+|-|~|\?)?exists:/i.test(token)) {
      lookupMechanisms.push(token);
    } else if (/^(\+|-|~|\?)?redirect=/i.test(token)) {
      lookupMechanisms.push(token);
    }
  }

  return lookupMechanisms;
}

/**
 * Extract include domains from lookup mechanisms
 */
function extractIncludes(mechanisms: string[]): string[] {
  const includes: string[] = [];

  for (const mechanism of mechanisms) {
    const match = mechanism.match(/include:([^\s]+)/i);
    if (match) {
      includes.push(match[1]);
    }

    const redirectMatch = mechanism.match(/redirect=([^\s]+)/i);
    if (redirectMatch) {
      includes.push(redirectMatch[1]);
    }
  }

  return includes;
}

/**
 * Recursively count all DNS lookups in SPF record chain
 */
async function countRecursiveLookups(
  domain: string,
  visited: Set<string> = new Set(),
  depth: number = 0
): Promise<{ total: number; chain: SpfLookupResult[] }> {
  // Prevent infinite loops and excessive depth
  if (visited.has(domain) || depth > 5) {
    return { total: 0, chain: [] };
  }
  visited.add(domain);

  let spfRecord: string | null = null;

  try {
    const txtRecords = await dns.resolveTxt(domain);
    for (const record of txtRecords) {
      const txt = record.join('');
      if (txt.startsWith('v=spf1')) {
        spfRecord = txt;
        break;
      }
    }
  } catch {
    // Could not resolve SPF for this domain
    return { total: 1, chain: [] }; // Count the failed lookup attempt
  }

  if (!spfRecord) {
    return { total: 0, chain: [] };
  }

  const lookupMechanisms = countLookupMechanisms(spfRecord);
  const includes = extractIncludes(lookupMechanisms);

  const result: SpfLookupResult = {
    domain,
    record: spfRecord,
    lookups: lookupMechanisms,
  };

  let totalLookups = lookupMechanisms.length;
  const chain: SpfLookupResult[] = [result];

  // Recursively count lookups in included SPF records
  for (const includeDomain of includes) {
    const subResult = await countRecursiveLookups(includeDomain, visited, depth + 1);
    totalLookups += subResult.total;
    chain.push(...subResult.chain);
  }

  return { total: totalLookups, chain };
}

export async function checkSpf(domain: string): Promise<CheckResult> {
  try {
    const txtRecords = await dns.resolveTxt(domain);

    // Find all SPF records — a domain must have exactly one (RFC 7208 §3.2)
    const spfRecords: string[] = [];
    for (const record of txtRecords) {
      const txt = record.join('');
      if (txt.startsWith('v=spf1')) {
        spfRecords.push(txt);
      }
    }

    if (spfRecords.length === 0) {
      return {
        status: 'fail',
        score: 0,
        details: {
          found: false,
          spf_record: null,
        },
        recommendations: [
          'Add an SPF record: v=spf1 include:_spf.example.com ~all',
          'Include authorized mail server IP ranges or service references',
        ],
      };
    }

    if (spfRecords.length > 1) {
      return {
        status: 'fail',
        score: 0,
        details: {
          found: true,
          multiple_records: true,
          spf_records: spfRecords,
        },
        recommendations: [
          `Multiple SPF records found (${spfRecords.length}). RFC 7208 requires exactly one SPF record per domain. Receivers will return permerror, causing email delivery failures. Remove all but one record.`,
        ],
      };
    }

    const spfRecord = spfRecords[0];

    // Count recursive lookups
    const { total: lookupCount, chain } = await countRecursiveLookups(domain);

    // Get mechanisms from main record
    const tokens = spfRecord.split(/\s+/);
    const lookupMechanisms = countLookupMechanisms(spfRecord);
    const includes = extractIncludes(lookupMechanisms);

    // Get final policy
    const finalPolicy = tokens[tokens.length - 1];
    const qualifier = finalPolicy.match(/^(\+|-|~|\?)/)?.[1] || '?';

    // Scoring
    let score = 80;
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    const recommendations: string[] = [];

    // Penalty for excessive lookups (RFC 7208 limit is 10)
    if (lookupCount > 10) {
      score -= 30;
      status = 'fail';
      recommendations.push(
        `Too many DNS lookups (${lookupCount}, max 10 per RFC 7208). Consider SPF flattening.`
      );
    } else if (lookupCount > 7) {
      score -= 15;
      status = 'warn';
      recommendations.push(
        `High DNS lookup count (${lookupCount}/10). Consider optimizing SPF.`
      );
    }

    // Check qualifier
    if (qualifier !== '-' && qualifier !== '~') {
      score -= 10;
      status = status === 'fail' ? 'fail' : 'warn';
      recommendations.push(
        `Policy qualifier is ${qualifier}all (consider -all for strict reject or ~all for soft fail)`
      );
    } else if (qualifier === '-') {
      score += 10; // Bonus for strict policy
    }

    return {
      status,
      score: Math.max(0, Math.min(100, score)),
      details: {
        found: true,
        spf_record: spfRecord,
        lookup_count: lookupCount,
        direct_lookups: lookupMechanisms.length,
        includes: includes,
        policy_qualifier: finalPolicy,
        all_mechanisms: tokens,
        lookup_chain: chain.map(c => ({
          domain: c.domain,
          lookups: c.lookups.length,
          mechanisms: c.lookups,
        })),
      },
      recommendations,
    };

  } catch (error) {
    return {
      status: 'fail',
      score: 0,
      details: {
        error: String(error),
      },
      recommendations: [
        'Check DNS nameserver configuration',
        'Verify domain is resolvable',
      ],
    };
  }
}
