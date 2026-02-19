/**
 * Main Scanner Orchestrator
 *
 * Coordinates all checks and produces final report
 */

import { checkMx } from '../checks/mx';
import { checkSpf } from '../checks/spf';
import { checkDkim } from '../checks/dkim';
import { checkDmarc } from '../checks/dmarc';
import { checkSmtp } from '../checks/smtp';
import { checkBlacklist } from '../checks/blacklist';
import { checkCompliance } from '../checks/compliance';
import { checkBimi, checkBimiRecord, checkBimiVmc } from '../checks/bimi';
import { checkMtaSts } from '../checks/mta-sts';
import { checkTlsRpt } from '../checks/tls-rpt';
import { CheckResult, ScanReport, ScanOptions } from '../types/scanner';

export async function scanDomain(domain: string, options?: ScanOptions): Promise<ScanReport> {
  const scanId = generateScanId();
  const timestamp = new Date();

  // Run checks in parallel
  const [mx, spf, dkim, dmarc, smtp, blacklist, compliance, bimi, mta_sts, tls_rpt, bimi_record, bimi_vmc] = await Promise.all([
    checkMx(domain).catch((err: unknown) => ({
      status: 'fail' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    })),
    checkSpf(domain).catch((err: unknown) => ({
      status: 'fail' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    })),
    checkDkim(domain, options?.dkim_selectors).catch((err: unknown) => ({
      status: 'fail' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    })),
    checkDmarc(domain).catch((err: unknown) => ({
      status: 'fail' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    })),
    checkSmtp(domain).catch((err: unknown) => ({
      status: 'fail' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    })),
    checkBlacklist(domain).catch((err: unknown) => ({
      status: 'warn' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    })),
    checkCompliance(domain).catch((err: unknown) => ({
      status: 'fail' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    })),
    checkBimi(domain).catch((err: unknown) => ({
      status: 'warn' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    })),
    checkMtaSts(domain).catch((err: unknown) => ({
      status: 'warn' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    })),
    checkTlsRpt(domain).catch((err: unknown) => ({
      status: 'warn' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    })),
    checkBimiRecord(domain).catch((err: unknown) => ({
      status: 'warn' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    })),
    checkBimiVmc(domain).catch((err: unknown) => ({
      status: 'warn' as const,
      score: 0,
      details: { error: String(err) },
      error: String(err)
    }))
  ]);

  // Calculate overall score (weighted average)
  const weights = { mx: 20, spf: 20, dkim: 20, dmarc: 25, smtp: 15 };
  const totalScore = Math.round(
    (mx.score * weights.mx +
     spf.score * weights.spf +
     dkim.score * weights.dkim +
     dmarc.score * weights.dmarc +
     smtp.score * weights.smtp) / 100
  );

  // Collect issues
  const issues: Array<{
    severity: 'error' | 'warning' | 'info';
    check: string;
    title: string;
    description: string;
    remediation?: string;
  }> = [];

  if (mx.status === 'fail') {
    issues.push({
      severity: 'error',
      check: 'mx',
      title: 'No valid MX records',
      description: String((mx.details as Record<string, unknown>).error || 'Domain has no MX records'),
      remediation: 'Add MX records to your DNS'
    });
  }

  if (spf.status === 'fail') {
    issues.push({
      severity: 'error',
      check: 'spf',
      title: 'No SPF record',
      description: 'SPF record not found',
      remediation: 'Add an SPF record to authorize mail senders'
    });
  }

  if (dkim.status === 'fail') {
    issues.push({
      severity: 'error',
      check: 'dkim',
      title: 'No DKIM keys found',
      description: 'No DKIM public keys discovered',
      remediation: 'Generate and publish DKIM keys'
    });
  }

  if (dmarc.status === 'fail') {
    issues.push({
      severity: 'warning',
      check: 'dmarc',
      title: 'No DMARC policy',
      description: 'DMARC record not found',
      remediation: 'Add a DMARC policy at _dmarc.yourdomain.com'
    });
  }

  if (smtp.status === 'fail') {
    issues.push({
      severity: 'error',
      check: 'smtp',
      title: 'SMTP connectivity failed',
      description: 'Could not connect to any MX servers',
      remediation: 'Check SMTP service and firewall configuration'
    });
  }

  if ((blacklist as CheckResult).status === 'fail') {
    issues.push({
      severity: 'error',
      check: 'blacklist',
      title: 'IP blacklisted',
      description: 'Mail server IP(s) found on one or more blacklists',
      remediation: 'Request delisting from each blacklist provider'
    });
  } else if ((blacklist as CheckResult).status === 'warn') {
    issues.push({
      severity: 'warning',
      check: 'blacklist',
      title: 'Minor blacklist listings',
      description: 'Mail server IP(s) found on minor blacklists',
      remediation: 'Monitor and request delisting if affecting deliverability'
    });
  }

  if ((compliance as CheckResult).status === 'fail') {
    issues.push({
      severity: 'error',
      check: 'compliance',
      title: 'Compliance pages missing',
      description: 'No privacy or terms pages returning HTTP 200 were found',
      remediation: 'Add privacy and terms pages and ensure they return HTTP 200'
    });
  } else if ((compliance as CheckResult).status === 'warn') {
    issues.push({
      severity: 'warning',
      check: 'compliance',
      title: 'Partial compliance coverage',
      description: 'Some compliance pages or consent mechanisms are missing or incomplete',
      remediation: 'Review compliance report and add missing pages/consent mechanisms'
    });
  }

  // MTA-STS issues
  if ((mta_sts as CheckResult).status === 'fail') {
    issues.push({
      severity: 'warning',
      check: 'mta_sts',
      title: 'MTA-STS not configured',
      description: 'No MTA-STS record found - inbound email TLS is not enforced',
      remediation: 'Add MTA-STS TXT record and policy file to enforce TLS for incoming mail'
    });
  } else if ((mta_sts as CheckResult).status === 'warn') {
    issues.push({
      severity: 'info',
      check: 'mta_sts',
      title: 'MTA-STS partially configured',
      description: 'MTA-STS record found but policy may need attention',
      remediation: 'Review MTA-STS policy mode and ensure it is set to enforce'
    });
  }

  // TLS-RPT issues
  if ((tls_rpt as CheckResult).status === 'fail') {
    issues.push({
      severity: 'info',
      check: 'tls_rpt',
      title: 'TLS-RPT not configured',
      description: 'No TLS-RPT record found - you won\'t receive TLS failure reports',
      remediation: 'Add TLS-RPT TXT record at _smtp._tls.yourdomain.com'
    });
  }

  // BIMI issues
  if ((bimi_record as CheckResult).status === 'fail') {
    issues.push({
      severity: 'info',
      check: 'bimi_record',
      title: 'BIMI not configured',
      description: 'No BIMI record found - brand logos won\'t appear in email clients',
      remediation: 'Add BIMI TXT record at default._bimi.yourdomain.com'
    });
  }

  if ((bimi_vmc as CheckResult).status === 'warn' && (bimi_record as CheckResult).status === 'pass') {
    issues.push({
      severity: 'info',
      check: 'bimi_vmc',
      title: 'BIMI VMC not configured',
      description: 'BIMI record present but no VMC certificate - logo display may be limited',
      remediation: 'Consider adding a Verified Mark Certificate (VMC) for broader logo support'
    });
  }

  return {
    scan_id: scanId,
    domain,
    timestamp,
    status: 'completed',
    score: totalScore,
    categories: {
      mx, spf, dkim, dmarc, smtp, blacklist, compliance, bimi,
      mta_sts, tls_rpt, bimi_record, bimi_vmc
    },
    issues,
    recommendations: [
      ...((mx as CheckResult).recommendations || []),
      ...((spf as CheckResult).recommendations || []),
      ...((dkim as CheckResult).recommendations || []),
      ...((dmarc as CheckResult).recommendations || []),
      ...((smtp as CheckResult).recommendations || []),
      ...((blacklist as CheckResult).recommendations || []),
      ...((compliance as CheckResult).recommendations || []),
      ...((bimi as CheckResult).recommendations || []),
      ...((mta_sts as CheckResult).recommendations || []),
      ...((tls_rpt as CheckResult).recommendations || [])
    ]
  };
}

function generateScanId(): string {
  return `scan_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}
