// D1 analytics helpers. Only active when running in Cloudflare (DB binding present).
// In local dev the DB binding is absent so all functions are no-ops.

export interface ScanEventInsert {
  id: string;
  ts: number;
  domain: string;
  auth_status: 'anonymous' | 'authenticated';
  user_id: string | null;
  user_email: string | null;
  ip: string | null;
  limit_hit: 0 | 1;
}

export interface ScanEventUpdate {
  id: string;
  config_score: number;
  final_score: number;
  reputation_tier: string;
  mx_status: string;
  spf_status: string;
  dkim_status: string;
  dmarc_status: string;
  smtp_status: string;
}

export interface ProjectSaveInsert {
  id: string;
  ts: number;
  user_id: string;
  user_email: string | null;
  domain: string;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  run(): Promise<void>;
}

export function getDB(env: Record<string, unknown>): D1Database | null {
  return (env.DB as D1Database | undefined) ?? null;
}

export async function insertScanEvent(db: D1Database, evt: ScanEventInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO scan_events (id, ts, domain, auth_status, user_id, user_email, ip, limit_hit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(evt.id, evt.ts, evt.domain, evt.auth_status, evt.user_id, evt.user_email, evt.ip, evt.limit_hit)
    .run();
}

export async function updateScanEvent(db: D1Database, evt: ScanEventUpdate): Promise<void> {
  await db
    .prepare(
      `UPDATE scan_events
       SET config_score = ?, final_score = ?, reputation_tier = ?,
           mx_status = ?, spf_status = ?, dkim_status = ?, dmarc_status = ?, smtp_status = ?
       WHERE id = ?`
    )
    .bind(
      evt.config_score, evt.final_score, evt.reputation_tier,
      evt.mx_status, evt.spf_status, evt.dkim_status, evt.dmarc_status, evt.smtp_status,
      evt.id
    )
    .run();
}

export async function insertProjectSave(db: D1Database, evt: ProjectSaveInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO project_saves (id, ts, user_id, user_email, domain) VALUES (?, ?, ?, ?, ?)`
    )
    .bind(evt.id, evt.ts, evt.user_id, evt.user_email, evt.domain)
    .run();
}
