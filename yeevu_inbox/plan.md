# YeevuInbox — Implementation Plan

Ordered list of features to implement. Each phase is self-contained and can be implemented independently unless noted.

---

## Phase 1 — Scan Result History per Project

### Goal

Each project accumulates a scan history so users can track how their email configuration changes over time.

### Data Model Changes (`lib/storage/interface.ts`)

Extend `Project` with a `scanHistory` array. `lastScan` remains for backwards compatibility (always mirrors the most recent history entry).

```typescript
export interface ScanHistoryEntry {
  ts: string;                          // ISO timestamp
  finalScore: number;                  // post-multiplier score
  configScore: number;                 // pre-multiplier score
  reputationTier: string;              // 'clean' | 'minor_only' | 'major' | 'multi_major' | 'unknown'
  checks: {
    dmarc: number;                     // score 0–100
    spf: number;
    dkim: number;
    mx: number;
    smtp: number;
  };
}

export interface Project {
  domain: string;
  addedAt: string;
  lastScan: ProjectScanResult | null;  // unchanged — keep for compatibility
  scanHistory: ScanHistoryEntry[];     // newest first
}
```

### Storage Rules

- Max history entries per project: **20** (cap on append, drop oldest when exceeded)
- History entries stored within the existing KV value for the user (`user_projects:<id>`)
- No separate KV keys needed

### Files to Change

| File | Change |
|------|--------|
| `lib/storage/interface.ts` | Add `ScanHistoryEntry`, extend `Project.scanHistory` |
| `lib/storage/kv.ts` | `updateProjectScan` appends to `scanHistory`, trims to 20 |
| `lib/storage/file.ts` | Same append + trim logic |
| `app/api/projects/route.ts` | POST body passes `configScore`, `reputationTier`, per-check scores |
| `app/results/page.tsx` | Include `configScore`, `reputationTier`, per-check scores in save payload |
| `app/dashboard/page.tsx` | Render history trend (score over time, simple table or sparkline) |

### Dashboard UI

The project card gains a collapsible history section:

```
┌──────────────────────────────────────────────────────┐
│  example.com                          Score: 87       │
│                                                       │
│  Scan History                                         │
│  ──────────────────────────────────────────────────  │
│  2026-02-22  87 (config 92, minor_only)               │
│  2026-02-15  91 (config 91, clean)                    │
│  2026-02-08  74 (config 74, clean)                    │
└──────────────────────────────────────────────────────┘
```

---

## Phase 2 — Check Result Caching (TTL Policy)

### Goal

Avoid redundant DNS/network calls for the same domain within a short window. Reduces latency for repeated scans and protects third-party services (blacklist APIs, BIMI VMC URLs).

### TTL Policy

| Check group | TTL | Rationale |
|---|---|---|
| `mx`, `spf`, `dkim`, `dmarc` | 5 min | Core DNS — changes require propagation, rare mid-session |
| `mta_sts`, `tls_rpt`, `bimi_record`, `bimi_vmc` | 15 min | Policy DNS — very stable |
| `compliance` | 5 min | Site content can change in minutes — short TTL keeps feedback loop tight |
| `blacklist` | 24 hours | Cached **per domain**, not per user. Listings don't appear or clear in hours — blocklist DNS propagation itself takes 24–48h after remediation, so a 24h cache is accurate, not just a shortcut. |

### Storage

Use **Cloudflare KV** (already bound). Cache key: `cache:<checkType>:<domain>`.

**Cache is global — keyed by domain only, never by user.** DNS records, blacklist status, and site compliance content are properties of the domain, not the requester. Any user scanning the same domain within the TTL window gets the cached result. There is no per-user cache variant.

KV value: `{ result: CheckResult, cachedAt: number }` — JSON serialised.

KV `expirationTtl` set to the TTL for the check group, so Cloudflare auto-expires entries.

### Implementation

New file: `lib/utils/cache.ts`

```typescript
export async function getCachedResult(kv: KVNamespace, check: string, domain: string): Promise<CheckResult | null>
export async function setCachedResult(kv: KVNamespace, check: string, domain: string, result: CheckResult, ttlSeconds: number): Promise<void>
export const CHECK_TTL_SECONDS: Record<string, number> = {
  mx: 300, spf: 300, dkim: 300, dmarc: 300,
  mta_sts: 900, tls_rpt: 900, bimi_record: 900, bimi_vmc: 900,
  compliance: 300,
  blacklist: 86400,  // 24 hours — per domain, result-agnostic
}
```

The cache is checked and set inside `app/api/scan/[check]/route.ts` — wraps the existing `checkFn(domain)` call. The full scan route (`api/scan/route.ts`) also benefits automatically since it calls individual checks.

### Files to Change

| File | Change |
|------|--------|
| `lib/utils/cache.ts` | New file — get/set helpers + TTL map |
| `app/api/scan/[check]/route.ts` | Check cache before running, write cache after |
| `wrangler.toml` | Add dedicated `CACHE_KV` binding (isolated from projects KV) |

> **Resolved:** Use a dedicated `CACHE_KV` binding, isolated from `PROJECTS_KV`. Create with `wrangler kv namespace create CACHE_KV`.

---

## Phase 3 — Server-Side Rate Limiting (Durable Objects)

### Goal

Cookie-based limits (`FREE_SCANS_PER_DAY`) are client-enforceable only. Server-side rate limiting prevents:
- Scraping / automation abuse
- Cost blowups from blacklist and SMTP calls
- Hammering of third-party dependencies

### Why Durable Objects

KV has eventual consistency — race conditions make it unreliable for counters. Durable Objects provide a single-threaded, strongly consistent counter per key. This is the Cloudflare-recommended pattern for rate limiting on Workers.

### Rate Limit Policy

| Dimension | Limit |
|---|---|
| Anonymous — per IP, per hour | 10 scans |
| Anonymous — per IP, per day | 50 scans |
| Authenticated — per userId, per hour | 60 scans |
| Authenticated — per userId, per day | 300 scans |
| Per domain, per hour (any caller) | 30 scans |

### Durable Object Design

New Durable Object class: `RateLimiter`

- Keyed by `ip:<ip>`, `user:<userId>`, or `domain:<domain>`
- Internal state: `{ hourCount: number, hourWindowStart: number, dayCount: number, dayWindowStart: number }`
- Exposes a single `check(limit: { hourly: number, daily: number })` method — returns `{ allowed: boolean, retryAfter?: number }`
- Windows reset when `Date.now()` exceeds `windowStart + windowDuration`

### Enforcement Point

Rate limiting is enforced in `app/api/scan/preflight/route.ts` — the single gateway all scans pass through. Three checks run in parallel:

```typescript
const [ipResult, userResult, domainResult] = await Promise.all([
  rateLimiter.check('ip', clientIp, ANON_LIMITS),
  isAuthenticated ? rateLimiter.check('user', userId, AUTH_LIMITS) : Promise.resolve({ allowed: true }),
  rateLimiter.check('domain', domain, DOMAIN_LIMITS),
]);
```

If any check fails → `429 Too Many Requests` with `Retry-After` header and JSON body matching existing error shape:
```json
{ "error": "Too many requests", "rateLimited": true, "retryAfter": 60 }
```

### IP Extraction

Read `CF-Connecting-IP` header (set by Cloudflare automatically on all Worker requests). Do not use `X-Forwarded-For` — it can be spoofed.

### Files to Change / Create

| File | Change |
|------|--------|
| `lib/rate-limiter/index.ts` | Durable Object class `RateLimiter` |
| `app/api/scan/preflight/route.ts` | Enforce rate limits before existing preflight logic |
| `wrangler.toml` | Add DO binding + migration |

### wrangler.toml additions

```toml
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"

[[migrations]]
tag = "v1"
new_classes = ["RateLimiter"]
```

---

## Phase 4 — Analytics

See [analytics-plan.md](analytics-plan.md) for full detail.

Analytics is last so the D1 schema and instrumentation points can incorporate any data model additions from Phases 1–3 (e.g. `reputationTier`, rate limit events).

- [ ] D1 database + schema
- [ ] Instrumentation in preflight, scan, and projects routes
- [ ] `/api/admin` route (protected)
- [ ] `/admin` page

---

## Resolved Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Rate-limited response shape | JSON `{ error, rateLimited: true, retryAfter }` with `429` status — matches existing error shape |
| 2 | Cache KV isolation | Dedicated `CACHE_KV` binding, separate from `PROJECTS_KV` |
| 3 | Admin user sub | `auth0\|68699f577e5e9a9c0d641fa2` → set as `ADMIN_USER_IDS` wrangler secret |
| 4 | "Today" time window | Rolling 24h (not UTC midnight reset) |
| 5 | Analytics in local dev | Skip — analytics writes only run in Cloudflare (production environment) |
