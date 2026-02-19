/**
 * SMTP Connectivity Check
 *
 * Purpose: List SMTP/MX servers for the domain
 * Note: We don't actively probe SMTP servers as port 25 is often blocked
 * and results in false failures. We simply display the configured servers.
 */

import { promises as dns } from 'dns';
import { CheckResult } from '../types/scanner';

interface MxServer {
  hostname: string;
  priority: number;
  ip?: string;
}

export async function checkSmtp(domain: string, _mxHosts?: string[]): Promise<CheckResult> {
  try {
    // Resolve MX records for the domain
    let mxServers: MxServer[] = [];

    try {
      const mxRecords = await dns.resolveMx(domain);
      mxServers = mxRecords
        .sort((a, b) => a.priority - b.priority)
        .map(mx => ({
          hostname: mx.exchange,
          priority: mx.priority,
        }));

      // Try to resolve IP for each MX server (first 3)
      for (const server of mxServers.slice(0, 3)) {
        try {
          const ips = await dns.resolve4(server.hostname);
          if (ips.length > 0) {
            server.ip = ips[0];
          }
        } catch {
          // Could not resolve IP, that's okay
        }
      }
    } catch {
      // No MX records found
    }

    if (mxServers.length === 0) {
      return {
        status: 'fail',
        score: 0,
        details: {
          error: 'No MX records found for domain',
          servers: [],
          server_count: 0,
        },
        recommendations: [
          'Add MX records to your DNS configuration',
          'MX records tell other mail servers where to deliver email for your domain',
          'Example: Add MX record with priority 10 pointing to mail.yourdomain.com',
        ],
      };
    }

    // Determine score based on MX configuration
    let score = 100;
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    const recommendations: string[] = [];

    // Check for proper redundancy
    if (mxServers.length === 1) {
      score -= 10;
      status = 'warn';
      recommendations.push('Consider adding a backup MX server for redundancy');
    }

    // Check if any servers couldn't be resolved
    const unresolvedServers = mxServers.filter(s => !s.ip);
    if (unresolvedServers.length > 0) {
      score -= 10;
      if (status === 'pass') status = 'warn';
      recommendations.push(
        `${unresolvedServers.length} MX server(s) could not be resolved to an IP address`
      );
    }

    // Add standard recommendations
    if (recommendations.length === 0) {
      recommendations.push('MX records are properly configured');
    }

    recommendations.push('Verify MX hostnames are correct and resolvable');
    recommendations.push('Check SMTP port 25 is open and not blocked by firewall');
    recommendations.push(`Test with: telnet ${mxServers[0].hostname} 25`);

    return {
      status,
      score: Math.max(0, score),
      details: {
        server_count: mxServers.length,
        servers: mxServers.map(s => ({
          hostname: s.hostname,
          priority: s.priority,
          ip: s.ip || 'Could not resolve',
        })),
        primary_server: mxServers[0].hostname,
        has_redundancy: mxServers.length >= 2,
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
