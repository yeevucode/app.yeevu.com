import { CheckResult } from '../types/scanner';

interface KVNamespace {
  get(key: string, type: 'text'): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface CacheEntry {
  result: CheckResult;
  cachedAt: number;
}

// Write TTLs in seconds — how long entries live in KV.
// Set to the longest tier cache max age (free = 30 min) so all tiers
// can be served from the same cached entry. The per-tier freshness
// check happens at read time via the maxAge param.
// Blacklist is kept at 24 h — listings don't clear in hours.
export const CHECK_TTL_SECONDS: Record<string, number> = {
  mx:          1800,
  spf:         1800,
  dkim:        1800,
  dmarc:       1800,
  smtp:        1800,
  mta_sts:     1800,
  tls_rpt:     1800,
  bimi_record: 1800,
  bimi_vmc:    1800,
  compliance:  1800,
  blacklist:   86400, // 24 h — propagation delay makes shorter TTLs pointless
};

function cacheKey(check: string, domain: string): string {
  return `cache:${check}:${domain.toLowerCase()}`;
}

/**
 * Returns the cached entry (result + cachedAt timestamp) if one exists,
 * or null on a cache miss. The caller is responsible for checking whether
 * the entry is fresh enough for the current user's tier.
 */
export async function getCachedEntry(
  kv: KVNamespace,
  check: string,
  domain: string
): Promise<CacheEntry | null> {
  try {
    const raw = await kv.get(cacheKey(check, domain), 'text');
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

/**
 * Convenience wrapper: returns the cached result only if it is younger
 * than maxAgeSeconds. Pass maxAgeSeconds = 0 to always bypass cache.
 */
export async function getCachedResult(
  kv: KVNamespace,
  check: string,
  domain: string,
  maxAgeSeconds = 1800
): Promise<CheckResult | null> {
  if (maxAgeSeconds === 0) return null;
  const entry = await getCachedEntry(kv, check, domain);
  if (!entry) return null;
  const ageSeconds = (Date.now() - entry.cachedAt) / 1000;
  if (ageSeconds > maxAgeSeconds) return null;
  return entry.result;
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
