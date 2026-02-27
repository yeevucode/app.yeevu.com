# yeevu_inbox — Deep Research Report

**Date:** 2026-02-27
**Scope:** Full codebase audit of `yeevu_inbox/` — architecture, data flows, scoring logic, edge cases, bugs

---

## 1. What the App Does

`yeevu_inbox` is an **email deliverability checker** deployed as a Cloudflare Worker. Given any domain, it runs 11 checks covering DNS authentication records, reputation, and compliance, then produces a weighted 0-100 score. Users can save domains as "projects" to track deliverability over time via a dashboard with scan history.

The app lives at `https://app.yeevu.com/deliverability/` — a Next.js 15 app compiled with `opennextjs-cloudflare` and deployed as `deliverability-yeevu` worker.

---

## 2. Architecture

```
Browser
  └─> app.yeevu.com (Cloudflare zone)
       └─> test-reverse-proxy Worker
            ├─ /deliverability/* → deliverability-yeevu Worker (Next.js 15 app)
            └─ /*              → cpde2.hostypanel.com (static site origin)
```

### Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (React 19), deployed via `opennextjs-cloudflare` |
| Auth | `@auth0/nextjs-auth0` v3 |
| Storage (projects) | Cloudflare KV (`PROJECTS_KV`) |
| Cache (scan results) | Cloudflare KV (`CACHE_KV`) |
| Analytics | Cloudflare D1 (SQLite) |
| Rate limiting | Cloudflare Durable Objects (`RateLimiter` class) |
| DNS queries | Node.js `dns.promises` (available in Workers via compat flag) |
| External APIs | rbl-check.org (blacklist) |
| Styling | Custom CSS (dark theme, no UI library) |
| Charts | Recharts |

### Cloudflare Bindings

```
PROJECTS_KV  — stores user project lists (key: user_projects:<base64url(userId)>)
CACHE_KV     — stores per-check scan results (key: cache:<check>:<domain>)
DB           — D1 database (scan_events, project_saves, users tables)
RATE_LIMITER — Durable Object namespace
```

### Auth0 Config

Auth0 secrets (`AUTH0_SECRET`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`) are Cloudflare Worker secrets. Runtime vars (`AUTH0_BASE_URL`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_SESSION_NAME`, `AUTH0_COOKIE_PATH`, `AUTH0_TRANSACTION_COOKIE_NAME`, `AUTH0_TRANSACTION_COOKIE_PATH`) are in `wrangler.toml [vars]`.

`NEXT_PUBLIC_*` vars are in `.env.production` (build-time only). `wrangler.toml` vars are runtime only and do NOT work for Next.js public env vars.

---

## 3. Route Map

```
/                           → app/page.tsx           Home, domain search
/results?domain=X           → app/results/page.tsx   Live check results
/dashboard                  → app/dashboard/page.tsx  User projects

/api/scan/preflight         GET  Auth check + rate limit gate
/api/scan                   GET  Bulk scan (10 checks, no compliance)
/api/scan/[check]           GET  Individual check with KV caching
/api/scan/blacklist         GET  Standalone blacklist endpoint

/api/auth/[...auth0]        GET/POST  Auth0 callback handler
/api/projects               GET/POST  List/add projects
/api/projects/[domain]      GET/PUT/DELETE  Single project operations
/api/projects/[domain]/history  GET  Scan history

/api/admin/*                Admin analytics (protected by ADMIN_USER_IDS)
/api/widget/scan            Widget API endpoint
```

---

## 4. The 11 Checks

### 4.1 MX (`lib/checks/mx.ts`)

Queries MX records. Resolves each MX hostname to A/AAAA to validate it actually exists. Falls back to domain A/AAAA records per RFC 5321 if no MX exists.

**Scoring:**
- 0 valid MX → score 30, status `fail` (conceptually wrong: returns `fail` only if no MX at all AND no A fallback; if A fallback, returns `warn` 60)
- Actually: no MX + no A/AAAA → `fail` 0; no MX + A fallback → `warn` 60; 1 valid MX → `warn` 85; 2+ valid MX → `pass` 100
- Weight: **5%**

### 4.2 SPF (`lib/checks/spf.ts`)

Validates SPF record syntax and counts recursive DNS lookups. RFC 7208 mandates exactly one SPF record and max 10 lookup-consuming mechanisms.

**Key logic:**
1. Finds all TXT records starting with `v=spf1`
2. Enforces single-record rule (multiple = `fail`)
3. Calls `countRecursiveLookups(domain)` which recursively resolves all `include:` and `redirect=` domains, counting all lookup-consuming mechanisms (include, a, mx, ptr, exists, redirect)
4. Extracts the last token as the policy qualifier (`-all`, `~all`, `+all`, `?all`)

**Scoring:**
- Base score: 80
- >10 lookups: -30, `fail`
- 8-10 lookups: -15, `warn`
- Qualifier not `-` or `~`: -10, `warn`
- `-all` qualifier: +10 bonus (max 90 base, can reach 100 with -all)
- `score = max(0, min(100, score))`
- Weight: **20%**

### 4.3 DKIM (`lib/checks/dkim.ts`)

Probes 11 common selectors (`default`, `mail`, `selector1`, `selector2`, `s1`, `s2`, `k1`, `k2`, `google`, `dkim`, `x`) plus any caller-supplied selectors. Checks for DKIM1 record and estimates key strength from base64 string length.

**Key logic:**
- RSA key strength estimated by base64 length: <250 chars → 1024-bit (weak), <400 → 2048-bit, else 4096-bit
- Ed25519 keys always treated as strong (sentinel `keyBits=256`)
- Only 1024-bit RSA keys trigger a warning

**Scoring:**
- No keys: `fail`, score 0
- Keys found: base score 90
- Any 1024-bit RSA keys: -20, `warn`
- Weight: **20%**

**Note:** DKIM check runs **sequentially** through selectors (not parallel). For 11 selectors, this is 11 sequential DNS queries. Each that doesn't exist generates a DNS error/NXDOMAIN. This is the slowest check under slow DNS conditions.

### 4.4 DMARC (`lib/checks/dmarc.ts`)

Queries `_dmarc.<domain>` for a TXT record containing `v=DMARC1`. Parses DMARC tags using `indexOf('=')` to handle values containing `=` (e.g., `rua=mailto:dmarc@domain.com`).

**Scoring:**
- Not found: `fail`, score 0
- Found: base score 50 + policy contribution
  - `p=none` → +0 (50 total), `warn`
  - `p=quarantine` → +50 (100 base), `warn`
  - `p=reject` → +100 (150 base → capped at 100), `pass`
- No `rua` tag: -15
- Not strict alignment: -10
- `pct < 100` with enforcing policy: deducts proportional fraction of policy contribution
- Final: `max(0, min(100, score))`
- Weight: **25%** (highest weight check)

**Bug: UI/Status mismatch on `p=quarantine`**
The DMARC check returns `status: 'warn'` for `p=quarantine`, but the results page UI shows **"Great job! You have a valid DMARC record with a strong policy."** for quarantine. The check card body says it's good, but the status badge shows yellow "Warning". These are inconsistent signals.

### 4.5 SMTP (`lib/checks/smtp.ts`)

**Important:** Despite being called "SMTP Check", this check does **not** actually connect to port 25. It only resolves MX records and tries to resolve their IPs. Port 25 connectivity was intentionally removed (it's commonly blocked and caused false failures).

**Scoring:**
- No MX: `fail`, score 0
- 1 MX server: -10 (`warn`)
- Any unresolvable IPs: -10 (`warn`)
- All good: `pass`, score 100
- Weight: **5%**

**Note:** The check misleadingly recommends `telnet <mx-host> 25` in its output, implying port 25 testing, even though the check itself doesn't test port 25.

### 4.6 Blacklist (`lib/checks/blacklist.ts`)

Resolves top 2 MX server IPs (or A record fallback), then queries `rbl-check.org/rbl_api.php?ipaddress=<ip>` for each IP. Parses the semicolon-delimited response format.

**Key logic:**
- Classifies listings as "major" (Spamhaus, Barracuda, SpamCop, SORBS, NixSpam) or "minor"
- Major classification is by substring match on listing name/host
- Checks IPs **in parallel** (worst case: 2 API calls × 30s timeout = 30s, not 60s)
- On API error: returns `reputation_tier: 'unknown'`, no penalty applied

**Scoring (internal):**
- Base: 100
- Per major listing: -15 (max -60)
- Per minor listing: -5 (max -30)
- `min(score, 0)` floor

**Reputation tiers:**
- `clean`: no listings
- `minor_only`: only minor listings
- `major`: exactly 1 major listing
- `multi_major`: 2+ major listings
- `unknown`: API error

**Scoring (external penalty applied to overall score):**
See Section 5 (Scoring System). Blacklist is the only check that hits the score **twice** — once via its weighted contribution (15%) and once via a fixed penalty.

- Weight: **15%**

### 4.7 MTA-STS (`lib/checks/mta-sts.ts`)

Validates MTA-STS (RFC 8461). Checks for `_mta-sts.<domain>` TXT record and fetches the policy file at `https://mta-sts.<domain>/.well-known/mta-sts.txt`.

- Weight: **2%**

### 4.8 TLS-RPT (`lib/checks/tls-rpt.ts`)

Checks for `_smtp._tls.<domain>` TXT record with `v=TLSRPTv1`.

- Weight: **3%**

### 4.9 BIMI Record (`lib/checks/bimi.ts` — `checkBimiRecord`)

Checks for `default._bimi.<domain>` TXT record with `v=BIMI1`.

- Weight: **1%**

### 4.10 BIMI VMC (`lib/checks/bimi.ts` — `checkBimiVmc`)

Checks for Verified Mark Certificate (VMC) linked from the BIMI record's `a=` tag.

- Weight: **1%**

### 4.11 Compliance (`lib/checks/compliance.ts`)

**Most unusual check for an email deliverability tool.** Fetches actual HTTP pages to verify legal compliance. Makes up to 14 HTTP requests (3 privacy paths × 2 protocols + 4 terms paths × 2 protocols) in parallel.

**Checks:**
- Privacy page exists at `/privacy`, `/privacy-policy`, `/privacy-policy/` (HTTPS or HTTP, status 200)
- Terms page exists at `/terms`, `/terms-and-condition`, `/terms-and-conditions`, `/terms/`
- Consent checkbox or consent language found on privacy pages
- Subscription/newsletter form found on any page

**Scoring:**
- Both missing: `fail`, score 0
- Missing privacy: -30 (`warn`)
- Missing terms: -20 (`warn`)
- Missing consent: -10 (`warn`)
- Missing subscription: no penalty, just a suggestion

**Timeout per URL:** 8 seconds (`AbortController`)

- Weight: **3%**

**Important:** Compliance is **excluded** from the bulk scan API (`/api/scan`) but **included** in the individual check routes and the results page. See Section 5.3 for scoring implications.

---

## 5. Scoring System

### 5.1 Weights

```typescript
// lib/constants/scoring.ts — must sum to 100
const CHECK_WEIGHTS = {
  dmarc:      25,
  spf:        20,
  dkim:       20,
  blacklist:  15,
  mx:          5,
  smtp:        5,
  tls_rpt:     3,
  compliance:  3,
  mta_sts:     2,
  bimi_record: 1,
  bimi_vmc:    1,
  // Total: 100
};
```

### 5.2 Formula

The score is computed in two steps:

**Step 1 — Weighted config score:**
```
configScore = Σ(checkScore[i] × weight[i]) / Σ(weight[i] for checks actually run)
```
Denominator normalizes to weights actually present (skipped checks don't inflate or deflate).

**Step 2 — Blacklist penalty:**
```
reputationTier = blacklist.details.reputation_tier  (or 'unknown' on error)
penalty = BLACKLIST_PENALTIES[reputationTier]        (0, 5, 30, or 50)
overallScore = max(0, configScore - penalty)
```

**Blacklist penalty table:**
```
clean      →  0 pts
minor_only →  5 pts
major      → 30 pts
multi_major → 50 pts
unknown    →  0 pts  (API error: benefit of the doubt)
```

The blacklist check therefore hits the score twice: once via its 15% weight and once via the fixed penalty. A domain listed on multiple major blacklists loses approximately 50 + (15% × 30) = 54.5 points from the overall score.

### 5.3 Score Calculation Divergence: Results Page vs Bulk API

**Critical finding:** There are two separate code paths that calculate the final score, and they produce different results.

**Path A — Bulk Scan API** (`/api/scan/route.ts`):
Runs 10 checks (MX, SPF, DKIM, DMARC, SMTP, MTA-STS, TLS-RPT, BIMI Record, BIMI VMC, Blacklist). Excludes compliance. Normalizes against weight sum of **97** (100 − 3 for compliance).

**Path B — Results Page** (`/results/page.tsx`) and Dashboard Rescan:
Runs all 11 checks via individual `/api/scan/[check]` endpoints including compliance. Normalizes against weight sum of **100**.

**Divergence example:**
Assume all 10 non-compliance checks score 80, compliance scores 0:
- Bulk API: `(80 × 97) / 97 = 80`
- Results page: `(80 × 97 + 0 × 3) / 100 = 77.6 → 78`

A 2-point difference. For domains with compliant websites (compliance=100), the difference is smaller. The discrepancy grows when compliance score deviates significantly from the average of other checks.

**Impact:** The score shown on the results page can differ from a score returned by the API for the same domain at the same time.

### 5.4 Score Display

The `ScoreRingDark` component converts the 0-100 score to a 0-10 display:
```javascript
const displayScore = Math.round(score / 10); // "X of 10"
```

This means:
- Scores 75-84 all display as "8"
- A 1-point change at a band boundary (74→75) causes a visible UI change
- A 9-point change within a band (75→83) causes no visible change

The granularity is coarse but intentional. The underlying score is preserved for calculations.

---

## 6. Scan Flow (Results Page)

The results page uses individual check endpoints, not the bulk scan endpoint. Full flow:

```
1. User submits domain on homepage → navigate to /results?domain=X

2. results/page.tsx mounts (client component)
   → Reads domain from URL search params

3. Calls /api/scan/preflight?domain=X
   → Validates domain format
   → Checks blocklist
   → Resolves user session (Auth0)
   → Looks up user tier from D1 (authenticated users)
   → Checks Durable Object rate limiter (keyed by userId or IP)
   → If anonymous: checks cookie-based usage limit
   → If all pass: returns { allowed, authenticated, tier, cacheMaxAge, eventId }
   → If anonymous: increments cookie counter in response

4. Results page receives preflight response
   → On 429: shows "rate limited" message
   → On 403: shows "scan limit reached" message
   → On success: extracts cacheMaxAge for tier-appropriate cache freshness

5. Calls all 11 /api/scan/[check]?domain=X&maxAge=<cacheMaxAge> in parallel

6. Each /api/scan/[check] handler:
   a. Validates domain
   b. Checks blocklist
   c. Reads cache key from CACHE_KV with maxAge freshness check
   d. If cache hit (age ≤ maxAge): returns cached result (cached:true)
   e. If cache miss: runs actual check function
   f. Writes result to CACHE_KV with full TTL (non-blocking)
   g. Returns result

7. As each check completes, results page updates state
   → Recalculates score dynamically as checks come in
   → Score ring updates progressively

8. After all checks complete:
   → Final score displayed
   → Issues list rendered
   → Recommendations collected

9. If user is authenticated:
   → "Save Project" button available → calls POST /api/projects
   → Saves scan result and history entry to PROJECTS_KV
```

### Cache Architecture

The cache uses a two-layer TTL system:
- **Write TTL** (KV expiration): Stored in KV with full TTL so any tier can read it while valid
  - Most checks: 1800s (30 min)
  - Blacklist: 86400s (24 hrs)
- **Read freshness (maxAge)**: Per-tier maximum acceptable age
  - Enterprise: 0 (always live)
  - Scale: 300s (5 min)
  - Growth: 900s (15 min)
  - Free (auth): 1800s (30 min)
  - Anonymous: 300s (5 min) ← see bug below

---

## 7. Rate Limiting System

Two layers of rate limiting work in parallel:

### Layer 1: Durable Objects (Server-side, reliable)

In `/api/scan/preflight`, rate limits are enforced via Durable Objects. Each user or IP gets their own Durable Object instance keyed by `user:<userId>` or `ip:<clientIP>`.

**Limits by tier:**
```
Anonymous:  2/hr,  50/day
Free auth:  5/hr,  300/day
Growth:     10/hr, 600/day
Scale:      20/hr, 1200/day
Enterprise: 30/hr, 9999/day
```

When rate limited, returns 429 with `Retry-After` header. Preflight fires **once per scan session** (not per check), so rate limiting is checked only at scan initiation.

### Layer 2: Cookie-based daily limit (Anonymous users only, bypassable)

Anonymous users get a `yeevu_scan_usage` cookie tracking scan count + date. Limit: 3 scans/day. Resets automatically at midnight based on `YYYY-MM-DD` date comparison.

```json
// Cookie value (JSON, not HttpOnly)
{"count": 2, "date": "2026-02-27"}
```

**Bug: Cookie not HttpOnly.** The cookie is set without `httpOnly: true`, meaning JavaScript can read and modify it. Any user can open DevTools and delete or reset the cookie to bypass the 3-scan daily limit. The Durable Object layer (2/hr) still provides some protection, but the daily cookie limit can be trivially bypassed.

### IP Address for Anonymous Rate Limiting

```javascript
const forwarded = request.headers.get('X-Forwarded-For');
const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('CF-Connecting-IP');
```

In the deployment: `browser → CF edge → reverse proxy worker → deliverability worker`. When the reverse proxy calls the deliverability worker:
- `CF-Connecting-IP` is the Cloudflare edge IP (not the user's real IP)
- `X-Forwarded-For` contains the user's real IP (added by the reverse proxy)

So the code correctly uses `X-Forwarded-For[0]` for this topology.

**Potential bypass:** If a user can inject a custom `X-Forwarded-For` header before the first Cloudflare hop (e.g., sending `X-Forwarded-For: 1.2.3.4` from their browser), and if Cloudflare's reverse proxy appends rather than replaces the header, then `split(',')[0]` would pick up the user-injected value `1.2.3.4` instead of their real IP. The security depends on whether the proxy worker strips incoming `X-Forwarded-For` headers.

---

## 8. Storage System

### Project Data Model

```typescript
// Stored in PROJECTS_KV at key: user_projects:<base64url(userId)>
{
  userId: string,
  projects: [
    {
      domain: string,          // lowercase-normalized
      addedAt: string,         // ISO timestamp
      lastScan: {
        timestamp: string,
        overallScore: number,
        results: Record<string, { status: string; score: number }>
      } | null,
      scanHistory: [           // max 20 entries, newest first
        {
          ts: string,
          finalScore: number,
          configScore: number,
          reputationTier: string,
          checks: Record<string, number>
        }
      ],
      folder?: string          // optional, undefined = no folder
    }
  ]
}
```

All of a user's projects are stored in a single KV value (no pagination or splitting). For enterprise users with many projects, this blob could become large, but the 50-project max (Scale tier) and null (Enterprise) means it's bounded.

### Storage Abstraction

```typescript
// lib/storage/index.ts auto-detects environment
export function getProjectStorage(): IProjectStorage {
  // If Cloudflare Workers env detected → KVStorage
  // Otherwise → FileStorage (local dev)
}
```

File storage writes to `data/projects/<base64url-filename>.json`. KV storage writes to `PROJECTS_KV`.

Both implementations share the same `IProjectStorage` interface, making local dev without Cloudflare bindings work seamlessly.

### Tier Enforcement

Project limits are checked at `/api/projects` (POST) before adding:
```
Free:       1 project max
Growth:     10 projects max
Scale:      50 projects max
Enterprise: null (unlimited)
```

The tier is fetched from the D1 `users` table. Users not in the table default to 'free'. The code includes backward compatibility for old tier names: `'unlimited'` → `'enterprise'`, `'premium'` → `'growth'`.

---

## 9. Authentication

Auth0 v3 via `@auth0/nextjs-auth0`. The route handler at `app/api/auth/[...auth0]/route.ts` correctly awaits the `params` Promise before passing to `handleAuth()` — a required workaround for Next.js 15's async params.

All auth-related responses set no-cache headers to prevent stale auth state.

The session is server-side (cookie-based). On each preflight call, `getSession()` is invoked to determine if the user is authenticated and fetch their `userId`.

---

## 10. Analytics

D1 database schema (inferred from code):

```sql
-- Scan events (every preflight call)
scan_events (id, ts, domain, auth_status, user_id, user_email, ip, limit_hit, ...)

-- Project saves
project_saves (id, ts, user_id, user_email, domain)

-- User tier management
users (user_id, user_email, tier, updated_at)
```

Analytics inserts use `ctx.waitUntil()` — they fire asynchronously and do not block the response. If the Worker exits early, some events may be lost, but this is non-critical telemetry.

Admin endpoints at `/api/admin/*` are protected by checking `ADMIN_USER_IDS` env var.

---

## 11. Bugs & Issues Found

### Bug 1: DMARC Status/UI Mismatch (Severity: Medium)

**File:** `lib/checks/dmarc.ts:82`, `app/results/page.tsx` (DMARC check card)

The DMARC check returns `status: 'warn'` when `policy === 'quarantine'`. However, the results page shows:
```
"Great job! You have a valid DMARC record with a strong policy."
```
...for quarantine (same message as reject). So the card body says "Great job" but the status badge shows yellow "Warning". The check card header shows the score as `warn` (yellow badge) while the body text celebrates it as excellent. This creates contradictory messaging.

**Root cause:** `const status = policy === 'none' ? 'warn' : policy === 'reject' ? 'pass' : 'warn'` — quarantine falls to the final `'warn'`. The UI was updated to celebrate quarantine but the check status wasn't updated to match.

**Fix:** Either change the DMARC check to return `'pass'` for `p=quarantine`, or update the UI message to reflect "good but not perfect."

---

### Bug 2: Score Divergence Between Results Page and Bulk API (Severity: Medium)

**Files:** `app/api/scan/route.ts:85`, `app/results/page.tsx`, `app/dashboard/page.tsx`

The bulk scan API excludes compliance from scoring (normalizes against 97), while the results page and dashboard rescan include compliance (normalize against 100). This means the score shown in the UI can differ from the score returned by the API for the same domain.

**Example:** Domain with all non-compliance checks at 80, compliance at 0:
- API: 80
- UI: 78

The divergence is small (max ~3 points) but real. Scan history stores the results-page score (including compliance), creating yet another potential source of inconsistency.

---

### Intentional Design: Anonymous Users Get Fresher Cache Than Free Authenticated Users

**File:** `lib/utils/tier.ts:29`, `app/api/scan/preflight/route.ts:108-110`

```typescript
export const ANON_CACHE_MAX_AGE_SECONDS = 300; // 5 min

// In preflight:
const cacheMaxAge = isAuthenticated
  ? TIER_CACHE_MAX_AGE_SECONDS[tier]  // free = 1800 (30 min)
  : ANON_CACHE_MAX_AGE_SECONDS;       // anon = 300  (5 min)
```

Anonymous users get a 5-minute cache freshness window (same as Scale tier), while free authenticated users get 30 minutes. At first glance this appears backwards, but it is **intentional for conversion purposes**: anonymous visitors (typically the highest volume and most likely to evaluate the product) receive fresher, more impressive results. Free authenticated users, having already converted to sign-up, receive a benefit of reduced server load but are nudged toward paid tiers to get fresher data again. **Do not change this behaviour.**

---

### Bug 4: SPF Check — Missing `all` Qualifier Detection (Severity: Low)

**File:** `lib/checks/spf.ts:192-193`

```typescript
const finalPolicy = tokens[tokens.length - 1]; // Last token
const qualifier = finalPolicy.match(/^(\+|-|~|\?)/)?.[1] || '?';
```

If the SPF record doesn't end with an `all` mechanism (malformed, or ending with `include:something`), `finalPolicy` will be something like `include:_spf.google.com`. The regex won't match, `qualifier` defaults to `'?'`, and the check incorrectly reports the policy as `?all` and deducts 10 points for "not strict".

The check should explicitly detect the absence of an `all` mechanism and issue a separate, clearer error rather than misidentifying the policy.

---

### Bug 5: DKIM Check Sequential Selector Probing (Severity: Performance)

**File:** `lib/checks/dkim.ts:24-65`

DKIM probes 11 selectors **sequentially** in a `for` loop:
```typescript
for (const selector of selectorsToTry) {
  const dkimDomain = `${selector}._domainkey.${domain}`;
  try {
    const txtRecords = await dns.resolveTxt(dkimDomain); // awaited
    ...
  }
}
```

Each failed lookup (NXDOMAIN) takes some time. With 11 selectors and 11 sequential DNS queries, this is the slowest check when no DKIM keys exist. Under congested DNS conditions this could take 10+ seconds. All other checks use parallel DNS queries.

---

### Bug 6: Compliance Check — False Positives on Subscription Detection (Severity: Low)

**File:** `lib/checks/compliance.ts:45-51`

```typescript
function hasSubscriptionForm(html: string) {
  const lc = html.toLowerCase();
  if (/<form[^>]*>/.test(html) && /type=["']?email["']?/.test(html)) return true;
  if (lc.includes('subscribe') || lc.includes('newsletter') || lc.includes('sign up')) return true;
  return false;
}
```

Any page with a contact form with an email field, or any mention of "sign up" (e.g., "sign up for our service"), is marked as having a subscription form. This is a very broad heuristic with high false-positive potential. However, since having a subscription form only affects suggestions (no score penalty), the impact is low.

---

### Bug 7: Compliance Check Makes External HTTP Requests From Worker (Severity: Security/Policy)

**File:** `lib/checks/compliance.ts:59-88`

The compliance check fetches up to 14 URLs from arbitrary domains when scanning. This means the Cloudflare Worker is making outbound HTTP requests to user-specified domains, which could be used for:
- SSRF (Server-Side Request Forgery) to internal/non-public domains
- Using Yeevu as an HTTP proxy
- Triggering requests to attacker-controlled URLs for log poisoning

The domain is validated by `isValidDomain()` (regex check) but internal IPs and non-standard hostnames are not explicitly blocked. If the regex allows short hostnames (like `localhost` or `192.168.1.1`), SSRF is possible.

---

### Bug 8: SPF Recursive Lookup Can Make Many DNS Queries (Severity: Performance)

**File:** `lib/checks/spf.ts:85-136`

`countRecursiveLookups` uses `depth > 5` as a guard (allows up to depth 6). With deeply nested includes, it could trigger many DNS queries:
- 5 levels of nesting × many includes per level
- No timeout mechanism
- Could cause the Worker to time out for pathological SPF records

The recursion uses a `visited` set to prevent cycles, which is good. But there's no cap on the total number of queries made.

---

### Issue 9: SMTP Check Name vs Implementation Mismatch (Severity: UX/Clarity)

**File:** `lib/checks/smtp.ts`, `app/api/scan/route.ts:188-200`

The "SMTP Check" doesn't test SMTP connectivity. The name implies active port-25 testing, but the implementation only resolves MX records and their IPs. The results page even shows `telnet <hostname> 25` as a recommendation, making users think the check validated port 25 when it didn't.

The `app/api/scan/route.ts` issue messages say:
- "SMTP connectivity failed" → when actually no MX records
- "SMTP configuration needs improvement" → when actually no MX redundancy

---

### Issue 10: Scan History Stores Results-Page Score (Including Compliance)

**File:** `app/dashboard/page.tsx:129-166`

The dashboard rescan flow runs all 11 checks (including compliance) and stores the resulting score in scan history. This means history entries use compliance in their score calculation while the bulk API does not. Historical trends could show slight systematic differences if compliance scores fluctuate.

---

## 12. Potential Security Concerns

### 12.1 Non-HttpOnly Usage Cookie

The `yeevu_scan_usage` cookie for anonymous rate limiting is set without `httpOnly: true`. Any page JavaScript can read and delete it. Bypass: `document.cookie = 'yeevu_scan_usage=; expires=Thu, 01 Jan 1970 00:00:00 GMT'`.

### 12.2 X-Forwarded-For IP Trust

Rate limiting for anonymous users keys on `X-Forwarded-For[0]`. If a user can inject a spoofed `X-Forwarded-For: <fake-ip>` before the first Cloudflare hop, they could bypass IP-based rate limiting. The Durable Object still limits to 2/hr but using `ip:fake-ip` as the key.

### 12.3 Compliance Check SSRF

As noted in Bug 7, the compliance check fetches arbitrary URLs from user-supplied domains without blocking private IP ranges. Domains like `localhost`, `127.0.0.1`, or internal hostnames could potentially be probed, though Cloudflare Workers environments restrict most internal network access.

### 12.4 Blocklist Bypass via Case Variation

Domains in the blocklist (`BLOCKED_DOMAINS` env var) are compared case-insensitively in `isDomainBlocked()`, and domains are normalized to lowercase before storage. This appears handled correctly.

---

## 13. Architecture Strengths

1. **Clean storage abstraction** — Identical API for KV (production) and FileSystem (dev). Switching storage backends requires zero code changes.

2. **Shared scoring constants** — `lib/constants/scoring.ts` is imported by all three scoring locations (bulk API, results page, dashboard rescan). No duplicated weight constants.

3. **Graceful degradation** — All checks have try/catch. Blacklist API failure returns `unknown` tier (no penalty). Analytics writes use `waitUntil` (non-blocking). Cache writes use `.catch(() => {})` (non-fatal).

4. **Parallel execution** — All 10 bulk scan checks run via `Promise.all()`. Blacklist IP checks run in parallel. MX resolution runs in parallel. The individual check page also fires all 11 in parallel.

5. **Tier-aware caching** — The same KV cache entry serves all tiers. Higher tiers just accept less stale data (lower maxAge). Lower tiers benefit from cache written by higher-tier users without extra cost.

6. **Auth0 Next.js 15 fix** — The auth route correctly awaits the params Promise, a required workaround documented in the memory file.

7. **Score normalization** — Weighted average normalizes against weights actually present, so a missing compliance check doesn't artificially inflate other check weights.

---

## 14. Data Flow Diagram

```
User enters domain
        │
        ▼
/results?domain=X (client component)
        │
        ├─► GET /api/scan/preflight?domain=X
        │         │
        │         ├─ Auth0 session check
        │         ├─ D1: getUserTier(userId)
        │         ├─ Durable Object rate limit check
        │         ├─ [anon only] Cookie usage limit check
        │         ├─ D1: insertScanEvent (async)
        │         └─ Returns: { allowed, cacheMaxAge, eventId }
        │
        ├─► GET /api/scan/mx?domain=X&maxAge=1800
        ├─► GET /api/scan/spf?domain=X&maxAge=1800
        ├─► GET /api/scan/dkim?domain=X&maxAge=1800
        ├─► GET /api/scan/dmarc?domain=X&maxAge=1800
        ├─► GET /api/scan/smtp?domain=X&maxAge=1800
        ├─► GET /api/scan/blacklist?domain=X&maxAge=1800
        ├─► GET /api/scan/mta_sts?domain=X&maxAge=1800
        ├─► GET /api/scan/tls_rpt?domain=X&maxAge=1800
        ├─► GET /api/scan/bimi_record?domain=X&maxAge=1800
        ├─► GET /api/scan/bimi_vmc?domain=X&maxAge=1800
        └─► GET /api/scan/compliance?domain=X&maxAge=1800
                  │
                  ├─ Check CACHE_KV for cache:check:domain
                  │     ├─ Hit (age ≤ maxAge) → return cached result
                  │     └─ Miss → run check function
                  │                   │
                  │                   ├─ DNS queries (or HTTP for compliance/blacklist)
                  │                   └─ Write to CACHE_KV (async, non-blocking)
                  └─ Return { check, domain, timestamp, result, cached? }

Results arrive → client recalculates score progressively
        │
        ▼
User saves project
        │
        ├─► POST /api/projects { domain, scanResult, historyEntry }
        │         │
        │         ├─ Auth check (must be authenticated)
        │         ├─ D1: getUserTier
        │         ├─ Check TIER_LIMITS (1/10/50/null projects)
        │         ├─ KV: getUserProjects → add project → saveUserProjects
        │         └─ D1: insertProjectSave (async)
        └─ Project appears in dashboard
```

---

## 15. Summary Table

| Check | What it tests | External calls | DNS queries | Weight |
|-------|--------------|----------------|-------------|--------|
| MX | MX records + IP resolution | None | 1 + N×2 | 5% |
| SPF | SPF record + recursive lookups | None | 1 + recursive | 20% |
| DKIM | DKIM key discovery | None | 11 sequential | 20% |
| DMARC | DMARC policy | None | 1 | 25% |
| SMTP | MX records (no port 25) | None | 1 + up to 3 | 5% |
| Blacklist | IP reputation via rbl-check.org | Yes (rbl-check.org) | 1 + 2×resolve4 | 15% |
| MTA-STS | MTA-STS TXT + policy file | Yes (mta-sts.domain) | 1 | 2% |
| TLS-RPT | TLS-RPT TXT record | None | 1 | 3% |
| BIMI Record | BIMI TXT record | None | 1 | 1% |
| BIMI VMC | VMC certificate | Yes (VMC URL) | 1 | 1% |
| Compliance | Privacy/terms pages | Yes (16 HTTP requests) | None | 3% |

**Total weight: 100%**
**Bulk API runs:** All except Compliance (normalizes against 97)
**Results page runs:** All 11 (normalizes against 100)

---

## 16. Recommended Fixes (Priority Order)

1. **[High]** Fix DMARC status for `p=quarantine` — return `'pass'` or update UI messaging to be consistent
2. **[High]** Make the usage cookie `httpOnly: true` to prevent client-side bypass
3. **[Medium]** Parallelize DKIM selector probing with `Promise.all()`
5. **[Medium]** Add explicit missing-`all` detection in SPF check instead of defaulting to `?` qualifier
6. **[Low]** Rename SMTP check or clarify in UI that it checks MX config, not port-25 connectivity
7. **[Low]** Consider blocking private IP ranges in compliance check URLs to prevent SSRF
8. ~~**[Low]** Unify compliance scoring~~ **FIXED** — compliance now runs in the bulk API; all scoring paths normalize against denominator 100
9. **[Info]** Add explicit DNS/HTTP timeout constants to SPF recursive resolution
