/**
 * Usage limit tracking for anonymous users
 * Cookie-based with daily reset
 */

import { cookies } from 'next/headers';

const COOKIE_NAME = 'yeevu_scan_usage';
const FREE_SCANS_PER_DAY = 3;

interface UsageData {
  count: number;
  date: string; // YYYY-MM-DD format
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function parseUsageData(cookieValue: string | undefined): UsageData {
  if (!cookieValue) {
    return { count: 0, date: getTodayDate() };
  }

  try {
    const data = JSON.parse(cookieValue) as UsageData;
    // Reset if it's a new day
    if (data.date !== getTodayDate()) {
      return { count: 0, date: getTodayDate() };
    }
    return data;
  } catch {
    return { count: 0, date: getTodayDate() };
  }
}

/**
 * Check if anonymous user has remaining free scans
 */
export async function checkUsageLimit(): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const cookieStore = await cookies();
  const usageCookie = cookieStore.get(COOKIE_NAME);
  const usage = parseUsageData(usageCookie?.value);

  const remaining = Math.max(0, FREE_SCANS_PER_DAY - usage.count);

  return {
    allowed: usage.count < FREE_SCANS_PER_DAY,
    remaining,
    limit: FREE_SCANS_PER_DAY,
  };
}

/**
 * Increment usage count for anonymous user
 * Returns the updated cookie value to set in response
 */
export async function incrementUsage(): Promise<string> {
  const cookieStore = await cookies();
  const usageCookie = cookieStore.get(COOKIE_NAME);
  const usage = parseUsageData(usageCookie?.value);

  const newUsage: UsageData = {
    count: usage.count + 1,
    date: getTodayDate(),
  };

  return JSON.stringify(newUsage);
}

/**
 * Get the limit reached error response
 */
export function getLimitReachedError() {
  return {
    error: 'Daily scan limit reached. Sign in for unlimited scans.',
    limitReached: true,
    limit: FREE_SCANS_PER_DAY,
  };
}

export { FREE_SCANS_PER_DAY, COOKIE_NAME };
