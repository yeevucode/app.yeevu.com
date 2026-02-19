import { NextRequest, NextResponse } from 'next/server';
import { checkMx } from '../../../lib/checks/mx';
import { checkSpf } from '../../../lib/checks/spf';
import { checkDkim } from '../../../lib/checks/dkim';
import { checkDmarc } from '../../../lib/checks/dmarc';
import { checkSmtp } from '../../../lib/checks/smtp';
import { checkMtaSts } from '../../../lib/checks/mta-sts';
import { checkTlsRpt } from '../../../lib/checks/tls-rpt';
import { checkBimiRecord, checkBimiVmc } from '../../../lib/checks/bimi';
import { CheckResult } from '../../../lib/types/scanner';
import { isDomainBlocked, getBlockedDomainError } from '../../../lib/utils/blocklist';

export interface ScanResponse {
  scan_id: string;
  domain: string;
  timestamp: string;
  status: 'completed' | 'failed';
  score: number;
  checks: {
    mx: CheckResult;
    spf: CheckResult;
    dkim: CheckResult;
    dmarc: CheckResult;
    smtp: CheckResult;
    mta_sts?: CheckResult;
    tls_rpt?: CheckResult;
    bimi_record?: CheckResult;
    bimi_vmc?: CheckResult;
  };
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    check: string;
    title: string;
    description: string;
    remediation?: string;
  }>;
  recommendations: string[];
}

function generateScanId(): string {
  return `scan_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
  return domainRegex.test(domain);
}

function createErrorResult(error: Error | unknown): CheckResult {
  return {
    status: 'fail' as const,
    score: 0,
    details: { error: String(error) },
    recommendations: ['Check DNS configuration and try again'],
    error: String(error),
  };
}

function createWarnErrorResult(error: Error | unknown): CheckResult {
  return {
    status: 'warn' as const,
    score: 0,
    details: { error: String(error) },
    recommendations: ['Check DNS configuration and try again'],
    error: String(error),
  };
}

async function runScan(domain: string, options?: { dkim_selectors?: string[] }): Promise<ScanResponse> {
  const scanId = generateScanId();

  // Run all checks in parallel
  const [mx, spf, dkim, dmarc, smtp, mta_sts, tls_rpt, bimi_record, bimi_vmc] = await Promise.all([
    checkMx(domain).catch(createErrorResult),
    checkSpf(domain).catch(createErrorResult),
    checkDkim(domain, options?.dkim_selectors).catch(createErrorResult),
    checkDmarc(domain).catch(createErrorResult),
    checkSmtp(domain).catch(createErrorResult),
    checkMtaSts(domain).catch(createWarnErrorResult),
    checkTlsRpt(domain).catch(createWarnErrorResult),
    checkBimiRecord(domain).catch(createWarnErrorResult),
    checkBimiVmc(domain).catch(createWarnErrorResult),
  ]);

  // Calculate overall score using weighted average
  // MX: 20%, SPF: 20%, DKIM: 20%, DMARC: 25%, SMTP: 15%
  const weights = { mx: 20, spf: 20, dkim: 20, dmarc: 25, smtp: 15 };
  const overallScore = Math.round(
    (mx.score * weights.mx +
     spf.score * weights.spf +
     dkim.score * weights.dkim +
     dmarc.score * weights.dmarc +
     smtp.score * weights.smtp) / 100
  );

  // Collect issues
  const issues: ScanResponse['issues'] = [];

  if (mx.status === 'fail') {
    issues.push({
      severity: 'error',
      check: 'mx',
      title: 'No valid MX records',
      description: mx.error || 'Domain has no MX records or they do not resolve',
      remediation: 'Add MX records to your DNS pointing to your mail server'
    });
  } else if (mx.status === 'warn') {
    issues.push({
      severity: 'warning',
      check: 'mx',
      title: 'MX configuration needs improvement',
      description: 'MX records exist but configuration could be improved',
      remediation: 'Add at least 2 MX records for redundancy'
    });
  }

  if (spf.status === 'fail') {
    issues.push({
      severity: 'error',
      check: 'spf',
      title: 'No SPF record found',
      description: 'SPF record not found for this domain',
      remediation: 'Add an SPF record: v=spf1 include:_spf.example.com ~all'
    });
  } else if (spf.status === 'warn') {
    const spfDetails = spf.details as Record<string, unknown>;
    const lookupCount = typeof spfDetails?.lookup_count === 'number' ? spfDetails.lookup_count : 0;
    issues.push({
      severity: 'warning',
      check: 'spf',
      title: 'SPF configuration needs attention',
      description: lookupCount > 7
        ? `High DNS lookup count (${lookupCount})`
        : 'SPF policy could be stricter',
      remediation: 'Consider using -all for strict rejection and optimize DNS lookups'
    });
  }

  if (dkim.status === 'fail') {
    issues.push({
      severity: 'error',
      check: 'dkim',
      title: 'No DKIM keys found',
      description: 'No DKIM public keys discovered for common selectors',
      remediation: 'Generate and publish DKIM keys for your domain'
    });
  } else if (dkim.status === 'warn') {
    issues.push({
      severity: 'warning',
      check: 'dkim',
      title: 'DKIM key strength issue',
      description: 'DKIM keys found but may be using weak encryption',
      remediation: 'Upgrade to 2048-bit RSA keys for better security'
    });
  }

  if (dmarc.status === 'fail') {
    issues.push({
      severity: 'warning',
      check: 'dmarc',
      title: 'No DMARC policy',
      description: 'DMARC record not found at _dmarc.' + domain,
      remediation: 'Add a DMARC policy: v=DMARC1; p=none; rua=mailto:dmarc@' + domain
    });
  } else if (dmarc.status === 'warn') {
    issues.push({
      severity: 'warning',
      check: 'dmarc',
      title: 'DMARC policy is permissive',
      description: dmarc.details?.policy === 'none'
        ? 'DMARC policy is set to none (monitoring only)'
        : 'DMARC configuration could be improved',
      remediation: 'Consider upgrading policy to p=quarantine or p=reject'
    });
  }

  if (smtp.status === 'fail') {
    issues.push({
      severity: 'error',
      check: 'smtp',
      title: 'SMTP connectivity failed',
      description: 'Could not connect to any MX servers on port 25',
      remediation: 'Check SMTP service and firewall configuration'
    });
  } else if (smtp.status === 'warn') {
    issues.push({
      severity: 'warning',
      check: 'smtp',
      title: 'SMTP configuration needs improvement',
      description: 'SMTP servers reachable but configuration could be better',
      remediation: 'Enable STARTTLS on all mail servers'
    });
  }

  // MTA-STS issues
  if (mta_sts.status === 'fail') {
    issues.push({
      severity: 'warning',
      check: 'mta_sts',
      title: 'MTA-STS not configured',
      description: 'No MTA-STS record found - inbound email TLS is not enforced',
      remediation: 'Add MTA-STS TXT record and policy file to enforce TLS for incoming mail'
    });
  } else if (mta_sts.status === 'warn') {
    issues.push({
      severity: 'info',
      check: 'mta_sts',
      title: 'MTA-STS partially configured',
      description: 'MTA-STS record found but policy may need attention',
      remediation: 'Review MTA-STS policy mode and ensure it is set to enforce'
    });
  }

  // TLS-RPT issues
  if (tls_rpt.status === 'fail') {
    issues.push({
      severity: 'info',
      check: 'tls_rpt',
      title: 'TLS-RPT not configured',
      description: 'No TLS-RPT record found - you won\'t receive TLS failure reports',
      remediation: 'Add TLS-RPT TXT record at _smtp._tls.yourdomain.com'
    });
  }

  // BIMI issues
  if (bimi_record.status === 'fail') {
    issues.push({
      severity: 'info',
      check: 'bimi_record',
      title: 'BIMI not configured',
      description: 'No BIMI record found - brand logos won\'t appear in email clients',
      remediation: 'Add BIMI TXT record at default._bimi.yourdomain.com'
    });
  }

  if (bimi_vmc.status === 'warn' && bimi_record.status === 'pass') {
    issues.push({
      severity: 'info',
      check: 'bimi_vmc',
      title: 'BIMI VMC not configured',
      description: 'BIMI record present but no VMC certificate - logo display may be limited',
      remediation: 'Consider adding a Verified Mark Certificate (VMC) for broader logo support'
    });
  }

  // Collect all recommendations
  const recommendations = [
    ...(mx.recommendations || []),
    ...(spf.recommendations || []),
    ...(dkim.recommendations || []),
    ...(dmarc.recommendations || []),
    ...(smtp.recommendations || []),
    ...(mta_sts.recommendations || []),
    ...(tls_rpt.recommendations || []),
    ...(bimi_record.recommendations || []),
  ];

  return {
    scan_id: scanId,
    domain,
    timestamp: new Date().toISOString(),
    status: 'completed',
    score: overallScore,
    checks: { mx, spf, dkim, dmarc, smtp, mta_sts, tls_rpt, bimi_record, bimi_vmc },
    issues,
    recommendations,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const domain = searchParams.get('domain');

  if (!domain) {
    return NextResponse.json(
      { error: 'Domain parameter is required' },
      { status: 400 }
    );
  }

  if (!isValidDomain(domain)) {
    return NextResponse.json(
      { error: 'Invalid domain format' },
      { status: 400 }
    );
  }

  if (isDomainBlocked(domain)) {
    return NextResponse.json(getBlockedDomainError(), { status: 403 });
  }

  try {
    const result = await runScan(domain);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { error: 'Failed to scan domain. Please try again.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { domain?: string; options?: Record<string, unknown> };
    const { domain, options } = body;

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400 }
      );
    }

    if (!isValidDomain(domain)) {
      return NextResponse.json(
        { error: 'Invalid domain format' },
        { status: 400 }
      );
    }

    if (isDomainBlocked(domain)) {
      return NextResponse.json(getBlockedDomainError(), { status: 403 });
    }

    const result = await runScan(domain, options);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { error: 'Failed to scan domain. Please try again.' },
      { status: 500 }
    );
  }
}
