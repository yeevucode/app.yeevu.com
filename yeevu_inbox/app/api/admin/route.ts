import { NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { isAdmin } from '../../../lib/utils/admin';

interface D1Result {
  results: Record<string, number | string | null>[];
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  all(): Promise<D1Result>;
}

const WINDOW_24H = () => Date.now() - 24 * 60 * 60 * 1000;
const WINDOW_7D = () => Date.now() - 7 * 24 * 60 * 60 * 1000;
const WINDOW_30D = () => Date.now() - 30 * 24 * 60 * 60 * 1000;

async function queryAll(db: D1Database, sql: string, ...bindings: (string | number | null)[]): Promise<Record<string, number | string | null>[]> {
  const stmt = bindings.length ? db.prepare(sql).bind(...bindings) : db.prepare(sql);
  const result = await stmt.all();
  return result.results;
}

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let db: D1Database | null = null;
  try {
    const { env } = await getCloudflareContext();
    db = ((env as Record<string, unknown>).DB as D1Database | undefined) ?? null;
  } catch {
    return NextResponse.json({ error: 'Analytics not available in local dev' }, { status: 503 });
  }

  const adminIds = process.env.ADMIN_USER_IDS ?? '';
  if (!isAdmin(session.user.sub, adminIds)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!db) {
    return NextResponse.json({ error: 'DB binding not found' }, { status: 503 });
  }

  const now24h = WINDOW_24H();
  const now7d = WINDOW_7D();
  const now30d = WINDOW_30D();

  const [
    scans24h, scans7d, scans30d,
    authSplit,
    limitHits24h, limitHits7d, limitHits30d,
    topDomains,
    scoreDistribution,
    checkFailures,
    reputationBreakdown,
    topUsers,
    saves24h, saves7d, saves30d,
    recentScans,
  ] = await Promise.all([
    queryAll(db, `SELECT COUNT(*) as count FROM scan_events WHERE ts > ? AND limit_hit = 0`, now24h),
    queryAll(db, `SELECT COUNT(*) as count FROM scan_events WHERE ts > ? AND limit_hit = 0`, now7d),
    queryAll(db, `SELECT COUNT(*) as count FROM scan_events WHERE ts > ? AND limit_hit = 0`, now30d),

    queryAll(db, `SELECT auth_status, COUNT(*) as count FROM scan_events WHERE ts > ? AND limit_hit = 0 GROUP BY auth_status`, now30d),

    queryAll(db, `SELECT COUNT(*) as count FROM scan_events WHERE ts > ? AND limit_hit = 1`, now24h),
    queryAll(db, `SELECT COUNT(*) as count FROM scan_events WHERE ts > ? AND limit_hit = 1`, now7d),
    queryAll(db, `SELECT COUNT(*) as count FROM scan_events WHERE ts > ? AND limit_hit = 1`, now30d),

    queryAll(db, `SELECT domain, COUNT(*) as count FROM scan_events WHERE ts > ? AND limit_hit = 0 GROUP BY domain ORDER BY count DESC LIMIT 20`, now30d),

    queryAll(db, `SELECT (CAST(final_score AS INTEGER) / 10) * 10 as bucket, COUNT(*) as count FROM scan_events WHERE final_score IS NOT NULL AND ts > ? GROUP BY bucket ORDER BY bucket`, now30d),

    queryAll(db, `SELECT SUM(CASE WHEN mx_status='fail' THEN 1 ELSE 0 END) as mx_fail, SUM(CASE WHEN spf_status='fail' THEN 1 ELSE 0 END) as spf_fail, SUM(CASE WHEN dkim_status='fail' THEN 1 ELSE 0 END) as dkim_fail, SUM(CASE WHEN dmarc_status='fail' THEN 1 ELSE 0 END) as dmarc_fail, SUM(CASE WHEN smtp_status='fail' THEN 1 ELSE 0 END) as smtp_fail, COUNT(*) as total FROM scan_events WHERE ts > ? AND limit_hit = 0 AND final_score IS NOT NULL`, now30d),

    queryAll(db, `SELECT reputation_tier, COUNT(*) as count FROM scan_events WHERE reputation_tier IS NOT NULL AND ts > ? GROUP BY reputation_tier`, now30d),

    queryAll(db, `SELECT user_id, user_email, COUNT(*) as count FROM scan_events WHERE auth_status = 'authenticated' AND limit_hit = 0 AND ts > ? GROUP BY user_id ORDER BY count DESC LIMIT 20`, now30d),

    queryAll(db, `SELECT COUNT(*) as count FROM project_saves WHERE ts > ?`, now24h),
    queryAll(db, `SELECT COUNT(*) as count FROM project_saves WHERE ts > ?`, now7d),
    queryAll(db, `SELECT COUNT(*) as count FROM project_saves WHERE ts > ?`, now30d),

    queryAll(db, `SELECT id, ts, domain, auth_status, user_email, ip, final_score, limit_hit FROM scan_events ORDER BY ts DESC LIMIT 100`),
  ]);

  return NextResponse.json({
    scanTotals: {
      '24h': scans24h[0]?.count ?? 0,
      '7d': scans7d[0]?.count ?? 0,
      '30d': scans30d[0]?.count ?? 0,
    },
    authSplit,
    limitHits: {
      '24h': limitHits24h[0]?.count ?? 0,
      '7d': limitHits7d[0]?.count ?? 0,
      '30d': limitHits30d[0]?.count ?? 0,
    },
    topDomains,
    scoreDistribution,
    checkFailures: checkFailures[0] ?? {},
    reputationBreakdown,
    topUsers,
    projectSaves: {
      '24h': saves24h[0]?.count ?? 0,
      '7d': saves7d[0]?.count ?? 0,
      '30d': saves30d[0]?.count ?? 0,
    },
    recentScans,
  });
}
