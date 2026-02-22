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
    
    // Parse DMARC tags — use indexOf to handle values that contain '=' (e.g. rua mailto URIs)
    const tags = dmarcRecord.split(/;\s*/);
    const parsed: Record<string, string> = {};

    for (const tag of tags) {
      const eqIdx = tag.indexOf('=');
      if (eqIdx === -1) continue;
      const key = tag.slice(0, eqIdx).trim();
      const value = tag.slice(eqIdx + 1).trim();
      if (key) parsed[key] = value;
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
    
    // Factor in pct= (percentage of messages the policy applies to)
    const pct = Math.min(100, Math.max(0, parseInt(parsed['pct'] ?? '100', 10) || 100));

    // Calculate score
    let score = 50 + policyScore;
    if (!hasRua) score -= 15;
    if (alignment !== 'strict') score -= 10;

    // Reduce score proportionally when pct < 100 for enforcing policies
    // p=none is already monitoring-only so no additional penalty
    if (pct < 100 && (policy === 'quarantine' || policy === 'reject')) {
      const effectiveFraction = pct / 100;
      // Scale the policy contribution down proportionally
      const policyContribution = policyScore * (1 - effectiveFraction);
      score -= Math.round(policyContribution);
    }

    const status = policy === 'none' ? 'warn' : policy === 'reject' ? 'pass' : 'warn';

    const recommendations: string[] = [];

    if (policy === 'none') {
      recommendations.push(
        'Policy is p=none (monitoring only). After reviewing reports, upgrade to p=quarantine'
      );
    }

    if (pct < 100 && (policy === 'quarantine' || policy === 'reject')) {
      recommendations.push(
        `DMARC policy applies to only ${pct}% of messages — increase pct to 100 for full enforcement`
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
        pct,
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
