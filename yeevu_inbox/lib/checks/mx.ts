/**
 * MX Record Check
 * 
 * Purpose: Validate that the domain has valid MX records and proper DNS resolution
 */

import { promises as dns } from 'dns';
import { CheckResult } from '../types/scanner';

export async function checkMx(domain: string): Promise<CheckResult> {
  try {
    // Resolve MX records
    const mxRecords = await dns.resolveMx(domain);
    
    if (!mxRecords || mxRecords.length === 0) {
      // Fallback to A/AAAA per RFC
      const aRecords = await dns.resolve4(domain).catch(() => []);
      const aaaaRecords = await dns.resolve6(domain).catch(() => []);
      
      if (aRecords.length === 0 && aaaaRecords.length === 0) {
        return {
          status: 'fail',
          score: 0,
          details: {
            mx_records: [],
            fallback: false,
            error: 'No MX records and no A/AAAA records found'
          },
          recommendations: [
            'Add MX records to your domain DNS',
            'Use at least one MX record with priority value'
          ]
        };
      }
      
      return {
        status: 'warn',
        score: 60,
        details: {
          mx_records: [],
          fallback: true,
          fallback_addrs: [...aRecords, ...aaaaRecords]
        },
        recommendations: [
          'Add explicit MX records (RFC 5321 prefers MX over A/AAAA)'
        ]
      };
    }
    
    // Sort by priority
    mxRecords.sort((a, b) => a.priority - b.priority);
    
    // Validate each MX target resolves — all in parallel
    const results = await Promise.all(
      mxRecords.map(async (mx) => {
        const a4 = await dns.resolve4(mx.exchange).catch(() => [] as string[]);
        const a6 = await dns.resolve6(mx.exchange).catch(() => [] as string[]);
        const addrs = [...a4, ...a6];
        return {
          exchange: mx.exchange,
          priority: mx.priority,
          addrs,
          resolves: addrs.length > 0,
        };
      })
    );
    
    // Score based on redundancy and validity
    const validCount = results.filter(r => r.resolves).length;
    const score = validCount > 0 ? (validCount >= 2 ? 100 : 85) : 30;
    const status = validCount === 0 ? 'fail' : (validCount < 2 ? 'warn' : 'pass');
    
    return {
      status,
      score,
      details: {
        mx_records: results,
        count: mxRecords.length,
        valid_count: validCount
      },
      recommendations: validCount < 2 ? [
        'Add at least 2 MX records for redundancy',
        'Ensure both MX records resolve to valid mail servers'
      ] : []
    };
    
  } catch (error) {
    return {
      status: 'fail',
      score: 0,
      details: {
        error: String(error)
      },
      recommendations: [
        'Verify domain name is correct',
        'Check DNS nameserver configuration'
      ]
    };
  }
}
