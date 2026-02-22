/**
 * RateLimiter Durable Object class.
 *
 * This file imports from 'cloudflare:workers' (a runtime-only virtual module)
 * and must NEVER be imported by Next.js application code. It is bundled
 * exclusively by wrangler/esbuild when injected into .open-next/worker.js
 * via scripts/inject-do.mjs.
 */

// @ts-expect-error: cloudflare:workers is a runtime module resolved by wrangler
import { DurableObject } from 'cloudflare:workers';

import type { RateLimitConfig, RateLimitResult } from './index';

interface RateLimiterState {
  hourCount: number;
  hourWindowStart: number;
  dayCount: number;
  dayWindowStart: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class RateLimiter extends (DurableObject as any) {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const hourly = parseInt(url.searchParams.get('hourly') ?? '0', 10);
    const daily = parseInt(url.searchParams.get('daily') ?? '0', 10);

    const result = await this.check({ hourly, daily });
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async check(config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = (this as any).ctx.storage;

    const stored = (await storage.get('state')) as RateLimiterState | undefined;
    const s: RateLimiterState = stored ?? {
      hourCount: 0,
      hourWindowStart: now,
      dayCount: 0,
      dayWindowStart: now,
    };

    if (now - s.hourWindowStart >= HOUR_MS) {
      s.hourCount = 0;
      s.hourWindowStart = now;
    }

    if (now - s.dayWindowStart >= DAY_MS) {
      s.dayCount = 0;
      s.dayWindowStart = now;
    }

    if (s.hourCount >= config.hourly) {
      const retryAfter = Math.ceil((s.hourWindowStart + HOUR_MS - now) / 1000);
      return { allowed: false, retryAfter };
    }

    if (s.dayCount >= config.daily) {
      const retryAfter = Math.ceil((s.dayWindowStart + DAY_MS - now) / 1000);
      return { allowed: false, retryAfter };
    }

    s.hourCount++;
    s.dayCount++;
    await storage.put('state', s);

    return { allowed: true };
  }
}
