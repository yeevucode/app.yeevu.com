import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import { isDomainBlocked, getBlockedDomainError } from '../../../../lib/utils/blocklist';
import {
  checkUsageLimit,
  incrementUsage,
  getLimitReachedError,
  COOKIE_NAME,
  FREE_SCANS_PER_DAY,
} from '../../../../lib/utils/usage-limit';
import { isValidDomain } from '../../../../lib/utils/validate';
import { checkRateLimit, RateLimitResult, DOStub } from '../../../../lib/rate-limiter';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDB, insertScanEvent } from '../../../../lib/utils/analytics';
import { generateScanId } from '../../../../lib/utils/id';

const ANON_LIMITS = { hourly: 10, daily: 50 };
const AUTH_LIMITS = { hourly: 60, daily: 300 };
const DOMAIN_LIMITS = { hourly: 30, daily: 300 };

// Local interface — avoids dependency on @cloudflare/workers-types globals
interface DOId { readonly id: string }
interface RateLimiterNS {
  idFromName(name: string): DOId;
  get(id: DOId): DOStub;
}

async function getRateLimiterNS(): Promise<RateLimiterNS | null> {
  try {
    const { env } = await getCloudflareContext();
    return ((env as Record<string, unknown>).RATE_LIMITER as RateLimiterNS | undefined) ?? null;
  } catch {
    return null;
  }
}

async function enforceRateLimits(
  ns: RateLimiterNS,
  ip: string,
  domain: string,
  userId: string | null
): Promise<{ rateLimited: boolean; retryAfter?: number }> {
  const checks: Promise<RateLimitResult>[] = [
    checkRateLimit(ns.get(ns.idFromName(`ip:${ip}`)), ANON_LIMITS),
    checkRateLimit(ns.get(ns.idFromName(`domain:${domain}`)), DOMAIN_LIMITS),
  ];

  if (userId) {
    checks.push(checkRateLimit(ns.get(ns.idFromName(`user:${userId}`)), AUTH_LIMITS));
  }

  const results = await Promise.all(checks);
  const blocked = results.find((r) => !r.allowed);

  if (blocked) {
    return { rateLimited: true, retryAfter: blocked.retryAfter };
  }

  return { rateLimited: false };
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

  // Check if user is authenticated
  const session = await getSession();
  const isAuthenticated = !!session?.user;
  const userId = session?.user?.sub ?? null;

  // X-Forwarded-For carries the original client IP after the reverse-proxy hop.
  // CF-Connecting-IP in a worker-to-worker call is the Cloudflare edge IP, not the user's IP.
  const forwarded = request.headers.get('X-Forwarded-For');
  const ip = forwarded ? forwarded.split(',')[0].trim() : (request.headers.get('CF-Connecting-IP') ?? null);

  // Server-side rate limiting via Durable Objects (Cloudflare only)
  const rateLimiterNS = await getRateLimiterNS();
  if (rateLimiterNS) {
    const rl = await enforceRateLimits(rateLimiterNS, ip ?? 'unknown', domain, userId);
    if (rl.rateLimited) {
      return NextResponse.json(
        { error: 'Too many requests', rateLimited: true, retryAfter: rl.retryAfter },
        {
          status: 429,
          headers: rl.retryAfter ? { 'Retry-After': String(rl.retryAfter) } : {},
        }
      );
    }
  }

  // Analytics: insert scan event (Cloudflare only)
  // ctx.waitUntil() ensures the write completes even after the response is sent.
  const eventId = generateScanId('evt');
  try {
    const { env, ctx } = await getCloudflareContext();
    const db = getDB(env as Record<string, unknown>);
    if (db) {
      ctx.waitUntil(insertScanEvent(db, {
        id: eventId,
        ts: Date.now(),
        domain,
        auth_status: isAuthenticated ? 'authenticated' : 'anonymous',
        user_id: userId,
        user_email: session?.user?.email ?? null,
        ip,
        limit_hit: 0,
      }).catch(() => {}));
    }
  } catch { /* local dev — no DB binding */ }

  // Authenticated users get unlimited scans (beyond rate limiting)
  if (isAuthenticated) {
    return NextResponse.json({
      allowed: true,
      authenticated: true,
      unlimited: true,
      eventId,
    });
  }

  // Anonymous users: check cookie-based usage limit
  const usage = await checkUsageLimit();

  if (!usage.allowed) {
    // Record limit hit
    try {
      const { env, ctx } = await getCloudflareContext();
      const db = getDB(env as Record<string, unknown>);
      if (db) {
        ctx.waitUntil(insertScanEvent(db, {
          id: generateScanId('evt'),
          ts: Date.now(),
          domain,
          auth_status: 'anonymous',
          user_id: null,
          user_email: null,
          ip,
          limit_hit: 1,
        }).catch(() => {}));
      }
    } catch { /* local dev */ }
    return NextResponse.json(getLimitReachedError(), { status: 403 });
  }

  // Increment usage and set cookie
  const newUsageValue = await incrementUsage();

  const response = NextResponse.json({
    allowed: true,
    authenticated: false,
    remaining: usage.remaining - 1,
    limit: FREE_SCANS_PER_DAY,
    eventId,
  });

  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);

  response.cookies.set(COOKIE_NAME, newUsageValue, {
    expires: tomorrow,
    path: '/',
    sameSite: 'lax',
  });

  return response;
}
