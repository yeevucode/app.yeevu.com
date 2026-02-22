import { NextRequest, NextResponse } from 'next/server';
import { checkMx } from '../../../../lib/checks/mx';
import { checkSpf } from '../../../../lib/checks/spf';
import { checkDkim } from '../../../../lib/checks/dkim';
import { checkDmarc } from '../../../../lib/checks/dmarc';
import { checkSmtp } from '../../../../lib/checks/smtp';
import { checkMtaSts } from '../../../../lib/checks/mta-sts';
import { checkTlsRpt } from '../../../../lib/checks/tls-rpt';
import { checkBimiRecord, checkBimiVmc } from '../../../../lib/checks/bimi';
import { checkBlacklist } from '../../../../lib/checks/blacklist';
import { checkCompliance } from '../../../../lib/checks/compliance';
import { CheckResult } from '../../../../lib/types/scanner';
import { isDomainBlocked, getBlockedDomainError } from '../../../../lib/utils/blocklist';
import { isValidDomain } from '../../../../lib/utils/validate';
import { getCachedResult, setCachedResult, CHECK_TTL_SECONDS } from '../../../../lib/utils/cache';
import { getCloudflareContext } from '@opennextjs/cloudflare';

interface CacheKV {
  get(key: string, type: 'text'): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

async function getCacheKV(): Promise<CacheKV | null> {
  try {
    const { env } = await getCloudflareContext();
    return ((env as Record<string, unknown>).CACHE_KV as CacheKV | undefined) ?? null;
  } catch {
    return null;
  }
}

const checkFunctions: Record<string, (domain: string) => Promise<CheckResult>> = {
  mx: checkMx,
  spf: checkSpf,
  dkim: (domain) => checkDkim(domain),
  dmarc: checkDmarc,
  smtp: checkSmtp,
  mta_sts: checkMtaSts,
  tls_rpt: checkTlsRpt,
  bimi_record: checkBimiRecord,
  bimi_vmc: checkBimiVmc,
  blacklist: checkBlacklist,
  compliance: checkCompliance,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ check: string }> }
) {
  const { check } = await params;
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

  const checkFn = checkFunctions[check];
  if (!checkFn) {
    return NextResponse.json(
      { error: `Unknown check type: ${check}` },
      { status: 400 }
    );
  }

  const ttl = CHECK_TTL_SECONDS[check];
  const kv = ttl !== undefined ? await getCacheKV() : null;

  // Serve from cache if available
  if (kv && ttl !== undefined) {
    const cached = await getCachedResult(kv, check, domain);
    if (cached) {
      return NextResponse.json({
        check,
        domain,
        timestamp: new Date().toISOString(),
        result: cached,
        cached: true,
      });
    }
  }

  try {
    const result = await checkFn(domain);

    // Write to cache (non-blocking)
    if (kv && ttl !== undefined) {
      setCachedResult(kv, check, domain, result, ttl).catch(() => {});
    }

    return NextResponse.json({
      check,
      domain,
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (error) {
    console.error(`${check} check error:`, error);
    return NextResponse.json({
      check,
      domain,
      timestamp: new Date().toISOString(),
      result: {
        status: 'fail' as const,
        score: 0,
        details: { error: String(error) },
        recommendations: ['Check failed. Please try again.'],
      },
    });
  }
}
