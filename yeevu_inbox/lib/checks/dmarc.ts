/**
 * DMARC Check
 * 
 * Purpose: Validate DMARC policy presence and configuration
 */

import { promises as dns } from 'dns';
import { CheckResult } from '../types/scanner';

export async function checkDmarc(domain: string): Promise<CheckResult> {
  try {
    const dmarcDomain = `_dmarc.${domain}`;
    
    let dmarcRecord: string | null = null;
    try {
      const txtRecords = await dns.resolveTxt(dmarcDomain);
      dmarcRecord = txtRecords.flat().join('');
    } catch {
      // No DMARC record found
    }
    
    if (!dmarcRecord || !dmarcRecord.includes('v=DMARC1')) {
      return {
        status: 'fail',
        score: 0,
        details: {
          found: false,
          dmarc_record: null
        },
        recommendations: [
          'Add DMARC policy record to _dmarc.yourdomain.com',
          'Start with v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com',
          'Monitor reports, then move to p=quarantine and p=reject',
          'See: https://www.yeevu.com/email-deliverability/dmarc/'
        ]
      };
    }
    
    // Parse DMARC tags
    const tags = dmarcRecord.split(/;\s*/);
    const parsed: Record<string, string> = {};
    
    for (const tag of tags) {
      const [key, value] = tag.split('=');
      if (key && value) {
        parsed[key.trim()] = value.trim();
      }
    }
    
    // Check policy
    const policy = parsed['p'] || 'none';
    const policyRank: Record<string, number> = { none: 0, quarantine: 50, reject: 100 };
    const policyScore = policyRank[policy] || 0;
    
    // Check reporting
    const hasRua = !!parsed['rua'];
    const hasRuf = !!parsed['ruf'];
    
    // Check alignment
    const adkim = parsed['adkim'] || 'r'; // default relaxed
    const aspf = parsed['aspf'] || 'r';
    const alignment = adkim === 's' && aspf === 's' ? 'strict' : 'relaxed';
    
    // Calculate score
    let score = 50 + policyScore;
    if (!hasRua) score -= 15;
    if (alignment !== 'strict') score -= 10;
    
    const status = policy === 'none' ? 'warn' : policy === 'reject' ? 'pass' : 'warn';
    
    const recommendations: string[] = [];
    
    if (policy === 'none') {
      recommendations.push(
        'Policy is p=none (monitoring only). After reviewing reports, upgrade to p=quarantine'
      );
    }
    
    if (!hasRua) {
      recommendations.push(
        'Add rua tag to receive aggregate reports: rua=mailto:dmarc@yourdomain.com'
      );
    }
    
    if (alignment !== 'strict') {
      recommendations.push(
        'Consider strict alignment for better SPF/DKIM enforcement: adkim=s; aspf=s'
      );
    }
    
    return {
      status,
      score: Math.max(0, Math.min(100, score)),
      details: {
        found: true,
        dmarc_record: dmarcRecord,
        parsed_tags: parsed,
        policy,
        has_rua: hasRua,
        has_ruf: hasRuf,
        dkim_alignment: adkim,
        spf_alignment: aspf,
        pct: parsed['pct'] || '100'
      },
      recommendations
    };
    
  } catch (error) {
    return {
      status: 'fail',
      score: 0,
      details: {
        error: String(error)
      },
      recommendations: [
        'Check DNS nameserver configuration',
        'Verify domain is resolvable'
      ]
    };
  }
}
