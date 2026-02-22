/**
 * Rate-limiter helpers imported by Next.js API routes.
 * Must NOT import from 'cloudflare:workers' — webpack can't resolve it.
 * The actual RateLimiter Durable Object class lives in do.ts, which is only
 * bundled by wrangler/esbuild (injected into worker.js at deploy time).
 */

export interface RateLimitConfig {
  hourly: number;
  daily: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // seconds until window resets
}

export interface DOStub {
  fetch(url: string): Promise<Response>;
}

// Helper called from route handlers to check a single rate limit dimension
export async function checkRateLimit(
  stub: DOStub,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const url = new URL('https://rate-limiter/check');
  url.searchParams.set('hourly', String(config.hourly));
  url.searchParams.set('daily', String(config.daily));
  const res = await stub.fetch(url.toString());
  return res.json() as Promise<RateLimitResult>;
}
