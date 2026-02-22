# Analytics Implementation Plan

> Goal: visibility on scan volume, user behaviour, check failure rates, and conversion signals.
> Storage: Cloudflare D1. Interface: protected `/admin` page in the app.

---

## 1. Infrastructure

### 1.1 Create D1 Database

```bash
wrangler d1 create yeevu-inbox-analytics
```

Copy the returned `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "yeevu-inbox-analytics"
database_id = "<returned-id>"
```

### 1.2 Schema

Run once via `wrangler d1 execute`:

```sql
CREATE TABLE scan_events (
  id            TEXT    PRIMARY KEY,
  ts            INTEGER NOT NULL,
  domain        TEXT    NOT NULL,
  auth_status   TEXT    NOT NULL,   -- 'anonymous' | 'authenticated'
  user_id       TEXT,               -- Auth0 user.sub, null if anonymous
  user_email    TEXT,               -- Auth0 user.email, null if anonymous
  config_score  INTEGER,
  final_score   INTEGER,
  reputation_tier TEXT,             -- 'clean' | 'minor_only' | 'major' | 'multi_major' | 'unknown'
  mx_status     TEXT,               -- 'pass' | 'warn' | 'fail'
  spf_status    TEXT,
  dkim_status   TEXT,
  dmarc_status  TEXT,
  smtp_status   TEXT,
  limit_hit     INTEGER NOT NULL DEFAULT 0  -- 1 if free limit was already reached
);

CREATE TABLE project_saves (
  id         TEXT    PRIMARY KEY,
  ts         INTEGER NOT NULL,
  user_id    TEXT    NOT NULL,
  user_email TEXT,
  domain     TEXT    NOT NULL
);

CREATE INDEX idx_scan_events_ts     ON scan_events(ts);
CREATE INDEX idx_scan_events_domain ON scan_events(domain);
CREATE INDEX idx_scan_events_user   ON scan_events(user_id);
```

### 1.3 Admin Auth — Env Var Whitelist

Add to `wrangler.toml` vars (or as a secret):

```toml
ADMIN_USER_IDS = "auth0|68699f577e5e9a9c0d641fa2"
```

Admin check helper (`lib/utils/admin.ts`):
```typescript
export function isAdmin(userId: string | undefined, adminIds: string): boolean {
  if (!userId) return false;
  return adminIds.split(',').map(s => s.trim()).includes(userId);
}
```

---

## 2. Instrumentation

Three existing routes get small additions. No new capture routes needed.

### 2.1 `app/api/scan/preflight/route.ts`

**When:** Every preflight request (whether allowed or blocked).

**Insert** a `scan_events` row immediately:
- `id` — new `generateScanId('evt')`
- `ts` — `Date.now()`
- `domain`
- `auth_status` — from session check
- `user_id` — `session.user.sub` or null
- `user_email` — `session.user.email` or null
- `limit_hit` — 1 if usage.allowed is false, else 0
- All score/status columns → null (filled in later by scan route)

**Return** the event `id` in the preflight response alongside existing fields so the scan route can reference it.

### 2.2 `app/api/scan/route.ts`

**When:** Full parallel scan completes.

**Update** the existing `scan_events` row (by the `id` returned from preflight) with:
- `config_score`, `final_score`, `reputation_tier`
- `mx_status`, `spf_status`, `dkim_status`, `dmarc_status`, `smtp_status`

The client already calls preflight before scan, so the row will always exist. If the row is missing for any reason, fall back to an INSERT.

### 2.3 `app/api/projects/route.ts` (POST)

**When:** User saves a project.

**Insert** a `project_saves` row:
- `id` — `generateScanId('save')`
- `ts`, `user_id`, `user_email`, `domain`

---

## 3. Admin API — `app/api/admin/route.ts`

**Auth:** Read session → check `user.sub` against `ADMIN_USER_IDS` env var → 403 if not admin.

**Single GET endpoint** that runs all queries in parallel and returns one JSON object:

```typescript
const [
  scanTotals,
  authSplit,
  limitHits,
  topDomains,
  scoreDistribution,
  checkFailures,
  reputationBreakdown,
  topUsers,
  projectSaveRate,
] = await Promise.all([...queries]);
```

### Queries

```sql
-- Scan totals (today / 7d / 30d)
SELECT COUNT(*) FROM scan_events WHERE ts > ? AND limit_hit = 0;

-- Auth split
SELECT auth_status, COUNT(*) as count
FROM scan_events WHERE limit_hit = 0
GROUP BY auth_status;

-- Limit hit count (today / 7d / 30d)
SELECT COUNT(*) FROM scan_events WHERE ts > ? AND limit_hit = 1;

-- Top 20 domains
SELECT domain, COUNT(*) as count
FROM scan_events WHERE limit_hit = 0
GROUP BY domain ORDER BY count DESC LIMIT 20;

-- Score distribution (buckets of 10)
SELECT (final_score / 10) * 10 as bucket, COUNT(*) as count
FROM scan_events WHERE final_score IS NOT NULL
GROUP BY bucket ORDER BY bucket;

-- Check failure rates
SELECT
  SUM(CASE WHEN mx_status    = 'fail' THEN 1 ELSE 0 END) as mx_fail,
  SUM(CASE WHEN spf_status   = 'fail' THEN 1 ELSE 0 END) as spf_fail,
  SUM(CASE WHEN dkim_status  = 'fail' THEN 1 ELSE 0 END) as dkim_fail,
  SUM(CASE WHEN dmarc_status = 'fail' THEN 1 ELSE 0 END) as dmarc_fail,
  SUM(CASE WHEN smtp_status  = 'fail' THEN 1 ELSE 0 END) as smtp_fail,
  COUNT(*) as total
FROM scan_events WHERE limit_hit = 0 AND final_score IS NOT NULL;

-- Reputation tier breakdown
SELECT reputation_tier, COUNT(*) as count
FROM scan_events WHERE reputation_tier IS NOT NULL
GROUP BY reputation_tier;

-- Top authenticated users (by scan count)
SELECT user_id, user_email, COUNT(*) as count
FROM scan_events WHERE auth_status = 'authenticated' AND limit_hit = 0
GROUP BY user_id ORDER BY count DESC LIMIT 20;

-- Project save rate (saves / authenticated scans)
SELECT COUNT(*) FROM project_saves WHERE ts > ?;
```

---

## 4. Admin Page — `app/admin/page.tsx`

Server component (reads session server-side, fetches from `/api/admin`).

**Sections:**

```
┌─────────────────────────────────────────────────────┐
│  Overview          Today   7d    30d                │
│  Total scans        12     84    310                │
│  Anon / Auth         9/3  61/23  230/80             │
│  Limit hits          2     11    38                 │
│  Project saves       1      8    22                 │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Check Failure Rates (last 30d)                     │
│  DMARC  ████████████████░░░░  64%                  │
│  SPF    ████████░░░░░░░░░░░░  38%                  │
│  DKIM   ██████░░░░░░░░░░░░░░  29%                  │
│  MX     ██░░░░░░░░░░░░░░░░░░   9%                  │
│  SMTP   █░░░░░░░░░░░░░░░░░░░   5%                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Score Distribution (last 30d)                      │
│  0–10   ██  3%                                      │
│  10–20  ███  5%                                     │
│  ...                                                │
│  80–90  ████████████  22%                           │
│  90–100 ██████████████████  35%                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Reputation Tier Breakdown          Top Domains     │
│  clean       78%                    example.com  14 │
│  minor_only  12%                    foo.io        9 │
│  major        7%                    bar.net       7 │
│  multi_major  3%                    ...           . │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Top Users (authenticated)                          │
│  alice@example.com   42 scans                       │
│  bob@foo.io          17 scans                       │
│  ...                                                │
└─────────────────────────────────────────────────────┘
```

No charting library — ASCII-style progress bars rendered with `<div>` width percentages in Tailwind (or plain CSS). Server-rendered, no client JS needed.

---

## 5. Files Changed / Created

| Action | File |
|--------|------|
| CREATE | `lib/utils/admin.ts` |
| CREATE | `lib/utils/analytics.ts` — D1 insert/update helpers |
| CREATE | `app/api/admin/route.ts` |
| CREATE | `app/admin/page.tsx` |
| MODIFY | `app/api/scan/preflight/route.ts` — insert scan_event, return event id |
| MODIFY | `app/api/scan/route.ts` — update scan_event with results |
| MODIFY | `app/api/projects/route.ts` — insert project_save |
| MODIFY | `wrangler.toml` — D1 binding + ADMIN_USER_IDS |
| MODIFY | `lib/types/scanner.ts` — add `eventId` to preflight response type |

---

## 6. Resolved Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Admin `user.sub` | `auth0\|68699f577e5e9a9c0d641fa2` — set as `ADMIN_USER_IDS` wrangler secret |
| 2 | Time window for "today" | Rolling 24h window (not UTC midnight reset) |
| 3 | Analytics in local dev | Skip — D1 writes only execute when running in Cloudflare (production) |
