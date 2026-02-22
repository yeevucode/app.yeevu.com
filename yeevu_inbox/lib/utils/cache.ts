import { CheckResult } from '../types/scanner';

interface KVNamespace {
  get(key: string, type: 'text'): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface CacheEntry {
  result: CheckResult;
  cachedAt: number;
}

// TTL in seconds — cache is global (per domain, not per user)
export const CHECK_TTL_SECONDS: Record<string, number> = {
  mx: 300,
  spf: 300,
  dkim: 300,
  dmarc: 300,
  mta_sts: 900,
  tls_rpt: 900,
  bimi_record: 900,
  bimi_vmc: 900,
  compliance: 300,
  blacklist: 86400, // 24 hours — listings don't clear in hours; propagation itself takes 24-48h
};

function cacheKey(check: string, domain: string): string {
  return `cache:${check}:${domain.toLowerCase()}`;
}

export async function getCachedResult(
  kv: KVNamespace,
  check: string,
  domain: string
): Promise<CheckResult | null> {
  try {
    const raw = await kv.get(cacheKey(check, domain), 'text');
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    return entry.result;
  } catch {
    return null;
  }
}

export async function setCachedResult(
  kv: KVNamespace,
  check: string,
  domain: string,
  result: CheckResult,
  ttlSeconds: number
): Promise<void> {
  try {
    const entry: CacheEntry = { result, cachedAt: Date.now() };
    await kv.put(cacheKey(check, domain), JSON.stringify(entry), {
      expirationTtl: ttlSeconds,
    });
  } catch {
    // Cache write failure is non-fatal
  }
}
