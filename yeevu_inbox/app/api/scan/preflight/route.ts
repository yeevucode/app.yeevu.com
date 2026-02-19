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

function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
  return domainRegex.test(domain);
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

  // Authenticated users get unlimited scans
  if (isAuthenticated) {
    return NextResponse.json({
      allowed: true,
      authenticated: true,
      unlimited: true,
    });
  }

  // Anonymous users: check usage limit
  const usage = await checkUsageLimit();

  if (!usage.allowed) {
    return NextResponse.json(getLimitReachedError(), { status: 403 });
  }

  // Increment usage and set cookie
  const newUsageValue = await incrementUsage();

  const response = NextResponse.json({
    allowed: true,
    authenticated: false,
    remaining: usage.remaining - 1, // After this scan
    limit: FREE_SCANS_PER_DAY,
  });

  // Set cookie with usage data (expires at midnight or 24h)
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);

  response.cookies.set(COOKIE_NAME, newUsageValue, {
    expires: tomorrow,
    path: '/',
    sameSite: 'lax',
  });

  return response;
}
