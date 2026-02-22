/**
 * BIMI Check (Brand Indicators for Message Identification)
 *
 * Purpose: Verify BIMI configuration including:
 * 1. BIMI record presence and validity (v= and l= tags)
 * 2. VMC certificate presence and validity (a= tag)
 *
 * Example record: v=BIMI1;l=https://example.com/logo.svg;a=https://example.com/vmc.pem
 */

import { promises as dns } from 'dns';
import { CheckResult } from '../types/scanner';

interface BimiParsed {
  v: string;
  l: string;
  a: string;
  raw: string;
}

function timeoutFetch(url: string, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(id));
}

async function fetchHead(url: string) {
  try {
    const res = await timeoutFetch(url);
    return { status: res ? res.status : 0, contentType: res?.headers.get('content-type') || '' };
  } catch {
    return { status: 0, contentType: '' };
  }
}

/**
 * Fetch and parse BIMI record from DNS.
 * Exported so callers that run both BIMI checks can share one DNS lookup
 * via checkBimiAll(). Since /api/scan/[check] calls each check in a separate
 * HTTP request from the client, the duplicate DNS lookup when hitting bimi_record
 * and bimi_vmc individually is architectural and cannot be fully avoided without
 * combining the endpoints. Accept the trade-off; document it here.
 */
export async function getBimiRecord(domain: string, selector = 'default'): Promise<BimiParsed | null> {
  const bimiDomain = `${selector}._bimi.${domain}`;

  try {
    const recs = await dns.resolveTxt(bimiDomain);
    const txts = recs.flat().map(s => s.toString());

    if (txts.length === 0) {
      return null;
    }

    const raw = txts.join('');
    const parts = raw.split(/;\s*/);
    const parsed: Record<string, string> = {};

    for (const p of parts) {
      const [k, ...vParts] = p.split('=');
      const v = vParts.join('=');
      if (k && v !== undefined) parsed[k.trim().toLowerCase()] = v.trim();
    }

    return {
      v: parsed['v'] || '',
      l: parsed['l'] || '',
      a: parsed['a'] || '',
      raw,
    };
  } catch {
    return null;
  }
}

/**
 * Check 1: BIMI Record Implementation
 * Validates the presence and format of the BIMI DNS record.
 * Pass a pre-fetched record to avoid a second DNS lookup (used by checkBimiAll).
 */
export async function checkBimiRecord(domain: string, prefetched?: BimiParsed | null): Promise<CheckResult> {
  try {
    const parsed = prefetched !== undefined ? prefetched : await getBimiRecord(domain);

    if (!parsed) {
      return {
        status: 'warn',
        score: 0,
        details: {
          has_record: false,
          selector: 'default',
        },
        recommendations: [
          'No BIMI record found at default._bimi.yourdomain.com',
          'Add a BIMI TXT record: v=BIMI1; l=https://yourdomain.com/logo.svg',
          'BIMI allows your brand logo to appear in recipient email clients',
        ],
      };
    }

    const issues: string[] = [];
    let score = 100;

    // Validate version tag
    if (parsed.v.toUpperCase() !== 'BIMI1') {
      issues.push(`Invalid version tag: expected "BIMI1", found "${parsed.v}"`);
      score -= 30;
    }

    // Validate logo URL
    if (!parsed.l) {
      issues.push('Missing l= tag (logo URL is required)');
      score -= 40;
    } else {
      // Check if logo URL is accessible
      const logoHead = await fetchHead(parsed.l);

      if (logoHead.status !== 200) {
        issues.push(`Logo URL returned HTTP ${logoHead.status} (expected 200)`);
        score -= 20;
      }

      // Check if content type is SVG
      if (logoHead.status === 200 && !/svg/i.test(logoHead.contentType)) {
        issues.push(`Logo content-type is "${logoHead.contentType}" (expected SVG)`);
        score -= 10;
      }
    }

    const status: 'pass' | 'warn' | 'fail' = issues.length === 0 ? 'pass' : score >= 60 ? 'warn' : 'fail';

    return {
      status,
      score: Math.max(0, score),
      details: {
        has_record: true,
        selector: 'default',
        raw_record: parsed.raw,
        version: parsed.v,
        logo_url: parsed.l || null,
        vmc_url: parsed.a || null,
        has_vmc: !!parsed.a,
      },
      recommendations: issues.length > 0 ? issues : ['BIMI record is properly configured'],
    };

  } catch (error) {
    return {
      status: 'fail',
      score: 0,
      details: {
        error: String(error),
      },
      recommendations: ['Unable to check BIMI record due to an error'],
    };
  }
}

/**
 * Check 2: BIMI VMC Certificate
 * Validates the presence of a Verified Mark Certificate (VMC).
 * Pass a pre-fetched record to avoid a second DNS lookup (used by checkBimiAll).
 */
export async function checkBimiVmc(domain: string, prefetched?: BimiParsed | null): Promise<CheckResult> {
  try {
    const parsed = prefetched !== undefined ? prefetched : await getBimiRecord(domain);

    if (!parsed) {
      return {
        status: 'warn',
        score: 0,
        details: {
          has_record: false,
          has_vmc: false,
        },
        recommendations: [
          'No BIMI record found - VMC check requires a BIMI record first',
          'Add a BIMI record with the a= tag pointing to your VMC certificate',
        ],
      };
    }

    if (!parsed.a) {
      return {
        status: 'warn',
        score: 50,
        details: {
          has_record: true,
          has_vmc: false,
          raw_record: parsed.raw,
        },
        recommendations: [
          'BIMI record found but no VMC certificate specified (a= tag is empty)',
          'A Verified Mark Certificate (VMC) provides stronger brand verification',
          'VMC certificates are issued by qualified authorities like DigiCert or Entrust',
          'Without VMC, some email clients may not display your logo',
        ],
      };
    }

    // VMC URL is present, validate it
    let vmcInfo: {
      url: string;
      status: number;
      contentType: string;
      isPem: boolean;
    } | null = null;

    try {
      const res = await timeoutFetch(parsed.a);
      const ct = res?.headers.get('content-type') || '';
      let isPem = false;

      if (res) {
        try {
          const text = await res.text();
          isPem = /-----BEGIN CERTIFICATE-----/.test(text);
        } catch {
          // Could not read body
        }
      }

      vmcInfo = {
        url: parsed.a,
        status: res ? res.status : 0,
        contentType: ct,
        isPem,
      };
    } catch (e) {
      return {
        status: 'fail',
        score: 30,
        details: {
          has_record: true,
          has_vmc: true,
          vmc_url: parsed.a,
          fetch_error: String(e),
        },
        recommendations: [
          `Could not fetch VMC certificate from ${parsed.a}`,
          'Ensure the VMC URL is accessible and returns a valid PEM certificate',
        ],
      };
    }

    const issues: string[] = [];
    let score = 100;

    if (vmcInfo.status !== 200) {
      issues.push(`VMC URL returned HTTP ${vmcInfo.status} (expected 200)`);
      score -= 30;
    }

    if (!vmcInfo.isPem) {
      const validCertTypes = /application\/(x-pem-file|pkix-cert|x-x509-ca-cert)/i;
      if (!validCertTypes.test(vmcInfo.contentType)) {
        issues.push(`VMC does not appear to be a valid PEM certificate`);
        issues.push(`Content-Type: ${vmcInfo.contentType || 'unknown'}`);
        score -= 30;
      }
    }

    const status: 'pass' | 'warn' | 'fail' = issues.length === 0 ? 'pass' : score >= 60 ? 'warn' : 'fail';

    return {
      status,
      score: Math.max(0, score),
      details: {
        has_record: true,
        has_vmc: true,
        vmc_url: parsed.a,
        vmc_status: vmcInfo.status,
        vmc_content_type: vmcInfo.contentType,
        vmc_is_pem: vmcInfo.isPem,
      },
      recommendations: issues.length > 0 ? issues : ['VMC certificate is properly configured'],
    };

  } catch (error) {
    return {
      status: 'fail',
      score: 0,
      details: {
        error: String(error),
      },
      recommendations: ['Unable to check VMC certificate due to an error'],
    };
  }
}

/**
 * Combined BIMI check — fetches DNS record once and passes to both sub-checks.
 * Use this when both results are needed in the same request context.
 */
export async function checkBimiAll(domain: string): Promise<{ record: CheckResult; vmc: CheckResult }> {
  const bimiRecord = await getBimiRecord(domain);
  const [recordResult, vmcResult] = await Promise.all([
    checkBimiRecord(domain, bimiRecord),
    checkBimiVmc(domain, bimiRecord),
  ]);
  return { record: recordResult, vmc: vmcResult };
}

/**
 * Combined BIMI check (for backward compatibility)
 * Returns combined score from both record and VMC checks
 */
export async function checkBimi(domain: string): Promise<CheckResult> {
  const { record: recordResult, vmc: vmcResult } = await checkBimiAll(domain);

  // Combined score: 60% record, 40% VMC
  const combinedScore = Math.round(recordResult.score * 0.6 + vmcResult.score * 0.4);

  const allRecommendations = [
    ...(recordResult.recommendations || []),
    ...(vmcResult.recommendations || []),
  ].filter(r => !r.includes('properly configured'));

  let status: 'pass' | 'warn' | 'fail' = 'pass';
  if (recordResult.status === 'fail' || vmcResult.status === 'fail') {
    status = 'fail';
  } else if (recordResult.status === 'warn' || vmcResult.status === 'warn') {
    status = 'warn';
  }

  return {
    status,
    score: combinedScore,
    details: {
      record: recordResult.details,
      vmc: vmcResult.details,
    },
    recommendations: allRecommendations.length > 0 ? allRecommendations : ['BIMI configuration looks good'],
  };
}
