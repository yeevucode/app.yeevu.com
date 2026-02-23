import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { isAdmin } from '../../../../lib/utils/admin';

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  all(): Promise<{ results: Record<string, number | string | null>[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

function buildWhere(
  filter: string,
  olderThanDays?: number
): { clause: string; bindings: (string | number)[] } {
  const parts: string[] = [];
  const bindings: (string | number)[] = [];

  if (filter === 'anonymous') {
    parts.push('auth_status = ?');
    bindings.push('anonymous');
  } else {
    parts.push('user_email = ?');
    bindings.push(filter);
  }

  if (olderThanDays && olderThanDays > 0) {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    parts.push('ts < ?');
    bindings.push(cutoff);
  }

  return { clause: parts.join(' AND '), bindings };
}

async function getDB(): Promise<D1Database | null> {
  try {
    const { env } = await getCloudflareContext();
    return ((env as Record<string, unknown>).DB as D1Database | undefined) ?? null;
  } catch {
    return null;
  }
}

async function requireAdmin(): Promise<{ error: NextResponse } | { ok: true }> {
  const session = await getSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  const adminIds = process.env.ADMIN_USER_IDS ?? '';
  if (!isAdmin(session.user.sub, adminIds)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true };
}

// GET /api/admin/scans?filter=<value>&olderThanDays=<n>
// Returns the count of matching scan_events rows (preview before delete).
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const sp = request.nextUrl.searchParams;
  const filter = sp.get('filter')?.trim() ?? '';
  const olderThanDays = Number(sp.get('olderThanDays') ?? 0) || 0;

  if (!filter) {
    return NextResponse.json({ error: 'filter is required' }, { status: 400 });
  }

  const db = await getDB();
  if (!db) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  const { clause, bindings } = buildWhere(filter, olderThanDays);

  const [countResult, rowsResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as count FROM scan_events WHERE ${clause}`)
      .bind(...bindings).all(),
    db.prepare(
      `SELECT id, ts, domain, auth_status, user_email, ip, final_score, limit_hit
       FROM scan_events WHERE ${clause} ORDER BY ts DESC LIMIT 500`
    ).bind(...bindings).all(),
  ]);

  const count = Number(countResult.results[0]?.count ?? 0);
  const rows = rowsResult.results;

  return NextResponse.json({ count, rows, filter, olderThanDays: olderThanDays || null });
}

// DELETE /api/admin/scans
// Body: { filter: string, olderThanDays?: number }
// Deletes matching rows from scan_events and returns the number deleted.
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await request.json() as { filter?: string; olderThanDays?: number };
  const filter = (body.filter ?? '').trim();
  const olderThanDays = Number(body.olderThanDays ?? 0) || 0;

  if (!filter) {
    return NextResponse.json({ error: 'filter is required' }, { status: 400 });
  }

  const db = await getDB();
  if (!db) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  const { clause, bindings } = buildWhere(filter, olderThanDays);
  const sql = `DELETE FROM scan_events WHERE ${clause}`;
  const runResult = await db.prepare(sql).bind(...bindings).run();
  const deleted = runResult.meta?.changes ?? 0;

  return NextResponse.json({ deleted, filter, olderThanDays: olderThanDays || null });
}
