# YeevuInbox — Deep Research Document

> Complete technical reference: how it works, how data flows, and current state of implementation.
> Last updated to reflect all Phase 0–5 fixes from todolist.md.

---

## 1. What It Is

YeevuInbox is an email deliverability checker deployed as a Cloudflare Worker at `app.yeevu.com/deliverability/`. It performs 11 distinct checks against a domain's DNS configuration, scores the results, and presents them progressively in a browser UI. Authenticated users can save domains as "projects" for later rescanning.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Cloudflare Workers via `@opennextjs/cloudflare` · Auth0 v3 · Cloudflare KV

---

## 2. Deployment Topology

```
Browser
  ↓
app.yeevu.com/*
  ↓
Cloudflare Worker: test-reverse-proxy
  ├── /deliverability/* → proxies to deliverability-yeevu.domains-12a.workers.dev (full path kept)
  └── everything else → origin cpde2.hostypanel.com (static site)
```

**Critical detail:** The reverse proxy forwards the full path. When a user visits `/deliverability/results?domain=foo.com`, the worker receives `/deliverability/results?domain=foo.com`. Next.js `basePath: '/deliverability'` tells the framework to strip that prefix when routing, so `/deliverability/results` maps to `app/results/page.tsx`.

**Build-time env vars (`yeevu_inbox/.env.production`):**
```
NEXT_PUBLIC_BASE_PATH=/deliverability
```
This is inlined into the client bundle by Next.js. It's what `API_BASE` in `results/page.tsx` uses to prefix all `fetch()` calls so they go through the reverse proxy route.

**Runtime env vars (`wrangler.toml [vars]`):**
```
NEXT_PUBLIC_BASE_PATH=/deliverability  (runtime — used by server-side code only)
AUTH0_ISSUER_BASE_URL=https://auth.yeevu.com
AUTH0_BASE_URL=https://app.yeevu.com/deliverability
```

**Cloudflare secrets (set via `wrangler secret put`):**
- `AUTH0_SECRET` — session encryption key
- `AUTH0_CLIENT_ID` — Auth0 application client ID
- `AUTH0_CLIENT_SECRET` — Auth0 application client secret
- `AUTH0_ISSUER_BASE_URL` — also stored as secret (duplicate of wrangler.toml var; secret takes precedence)

---

## 3. Full Scan Flow — Step by Step

### Step 1: User Enters Domain (`app/page.tsx`)

`page.tsx` is a client component. The user types a domain and submits the form. The domain is cleaned (protocol stripped, `www.` removed, trailing path removed), then `router.push('/results?domain=<domain>')` navigates to the results page. Next.js prepends the basePath automatically here because `router.push` is basePath-aware.

### Step 2: Results Page Initialization (`app/results/page.tsx`)

The results page is wrapped in a `<Suspense>` boundary because it uses `useSearchParams()` (required by Next.js). On mount:

1. `domain` is read from the URL query string.
2. All 11 check states are initialized to `{ result: null, loading: true, error: null }`.
3. `scanId` is generated client-side using `lib/utils/id.ts`.

### Step 3: Preflight Check

A `useEffect` fires immediately when `domain` is set. It calls:

```
GET /deliverability/api/scan/preflight?domain=<domain>
```

This hits `app/api/scan/preflight/route.ts`. The preflight does three things in order:

1. **Domain validation** — via `isValidDomain()` from `lib/utils/validate.ts`
2. **Blocklist check** — reads `BLOCKED_DOMAINS` env var, splits by comma, converts each pattern to regex using `patternToRegex()`, tests domain against all patterns
3. **Usage / auth check:**
   - Calls `getSession()` from `@auth0/nextjs-auth0`
   - If authenticated → returns `{ allowed: true, authenticated: true, unlimited: true }` (no cookie touched)
   - If anonymous → reads `yeevu_scan_usage` cookie (JSON: `{ count, date }`), checks against `FREE_SCANS_PER_DAY = 3`, resets if date is different day
   - If anonymous and within limit → increments count, sets cookie in response with midnight expiry, returns `{ allowed: true, authenticated: false, remaining: N }`
   - If at limit → returns 403 with `{ error, limitReached: true }`

The results page gates all subsequent fetches behind `preflightReady`. If preflight fails, it shows "Unable to Start Scan".

### Step 4: Parallel Check Fetches (Three Waves)

Once preflight passes, checks are fetched in three waves. **This ordering is intentional gamification — do not reorder without understanding the UX intent:**

```
Wave 1 (immediate):   dmarc, spf, dkim, mx, smtp
Wave 2 (100ms delay): mta_sts, tls_rpt, bimi_record, bimi_vmc
Wave 3 (200ms delay): blacklist, compliance
```

- **Wave 1** fires first so the score ring builds progressively, anchoring the user to a high configuration score.
- **Wave 3 (blacklist)** fires last deliberately. When a listing is found, the score visibly drops after the user has already seen the high config score. This communicates the severity of a reputation listing far more effectively than a static warning.

Each check calls:
```
GET /deliverability/api/scan/<checkType>?domain=<domain>
```

This hits `app/api/scan/[check]/route.ts`, which maps check name to function via:
```typescript
const checkFunctions = {
  mx, spf, dkim, dmarc, smtp, mta_sts, tls_rpt,
  bimi_record, bimi_vmc, blacklist, compliance
}
```

Results stream into React state as they arrive, so cards animate from skeleton → result progressively.

### Step 5: Score Calculation (Client-Side, Live)

The score is recalculated every time any check result arrives via `calculateScore()`. The function returns `{ configScore, finalScore, multiplier, reputationTier }`.

**Stage 1 — Configuration score (weighted average of 5 core checks):**
```typescript
// From lib/constants/scoring.ts — single source of truth
const CHECK_WEIGHTS = { dmarc: 30, spf: 25, dkim: 25, mx: 10, smtp: 10 };
```
Rationale: DMARC is the capstone (hardest to configure correctly); SPF/DKIM are equal foundations; MX/SMTP are infrastructure verification only.

Score = `Σ(check.score × weight) / Σ(weights of completed checks)`. The denominator grows as checks complete, so the score normalises correctly during progressive loading.

**Stage 2 — Reputation multiplier (applied post-calculation):**
```typescript
// From lib/constants/scoring.ts
const REPUTATION_MULTIPLIERS = {
  clean: 1.0,
  minor_only: 0.85,
  major: 0.5,
  multi_major: 0.25,
  unknown: 1.0,  // check errored — never penalise uncertainty
};
```
`finalScore = Math.round(configScore × REPUTATION_MULTIPLIERS[tier])`

Blacklist is **not** included in the weighted average. It provides the `reputation_tier` field that drives the multiplier. While the blacklist check is loading, `finalScore === configScore` (multiplier = 1.0). When the result arrives, if there are listings, the score drops visibly — this is the intended UX.

A red banner is shown between the score ring and check cards when `multiplier < 1.0`:
> "Reputation Penalty Applied — Configuration score was X, reduced to Y due to a blacklist listing."

### Step 6: Authentication Check (Concurrent with Checks)

A separate `useEffect` fires at the same time as Step 4. It calls `GET /deliverability/api/projects` to determine if the user is authenticated:
- 401 → `isAuthenticated = false`
- 200 → `isAuthenticated = true`, sets `projectLimits`, checks if current domain is already in user's project list

This drives the "Save Project" button visibility.

### Step 7: Saving a Project

When the user clicks "Save Project":
```
POST /deliverability/api/projects
Body: { domain, scanResult: { timestamp, overallScore, results: { [checkType]: { status, score } } } }
```

`overallScore` is the post-multiplier `finalScore`. The API reads the Auth0 session, extracts `user.sub` as userId, calls `KVStorage.addProject()`. The KV key is `user_projects:<base64url(userId)>`.

### Step 8: Recent Scans (localStorage)

Before fetches start, the domain is written to `localStorage['recentScans']` as `{ domain, score: 0, timestamp }`. As the score updates, this entry is updated. The home page reads this to show "Recent Scans" links. Capped at 10 entries.

---

## 4. Each Check — Internals and Specifics

### 4.1 MX Check (`lib/checks/mx.ts`)

**What it does:**
1. `dns.resolveMx(domain)` — gets MX records
2. For each MX exchange: resolves both IPv4 and IPv6 addresses **in parallel** (`Promise.all`)
3. RFC fallback: if no MX records, tries A/AAAA records (RFC 5321 allows this)

**Scoring:**
- 2+ valid MX records → 100 (pass)
- 1 valid MX record → 85 (warn)
- MX records exist but none resolve → 30 (fail)
- No MX records, no A/AAAA fallback → 0 (fail)
- No MX records but A/AAAA exists → 60 (warn)

---

### 4.2 SPF Check (`lib/checks/spf.ts`)

**What it does:**
1. `dns.resolveTxt(domain)` — finds all TXT records starting with `v=spf1`
2. Detects multiple SPF records (RFC 7208 §3.2 requires exactly one — multiple causes `permerror`)
3. Counts DNS lookup mechanisms: `include:`, `a`, `mx`, `ptr`, `exists:`, `redirect=`
4. **Recursively follows `include:` and `redirect=` domains** up to depth 5, accumulating total lookup count
5. Extracts the final `all` qualifier

**Recursive lookup counter detail:**
`countRecursiveLookups()` uses a `Set<string>` to prevent infinite loops (circular SPF includes). Returns `{ total, chain, brokenIncludes }`. When DNS resolution fails for an included domain, returns `total: 1` (the failed lookup still consumed an RFC slot) and adds the domain to `brokenIncludes[]`.

**Broken include recommendations:**
If any includes failed DNS resolution, a recommendation is added:
> "include: target `<domain>` does not resolve — this will cause a permerror on strict receivers"

The `hadError: true` flag on chain items allows the lookup chain UI to distinguish failed vs successful lookups.

**Scoring:**
- Base: 80
- >10 lookups (RFC violation): -30, status=fail
- 7–10 lookups (warning zone): -15, status=warn
- Non `-all` or `~all` qualifier: -10, status=warn
- Strict `-all` qualifier: +10 bonus
- Final: clamped 0–100

---

### 4.3 DKIM Check (`lib/checks/dkim.ts`)

**What it does:**
1. Probes 11 common selectors: `['default', 'mail', 'selector1', 'selector2', 's1', 's2', 'k1', 'k2', 'google', 'dkim', 'x']`
2. For each selector: `dns.resolveTxt(<selector>._domainkey.<domain>)`
3. Parses the DKIM record for `p=` (public key) and `k=` (key algorithm)
4. Estimates key bit-length from the base64 `p=` value length

**Key strength estimation:**
```typescript
if (keyAlgo === 'Ed25519') {
  keyBits = 256;  // sentinel — never treated as weak
} else if (keyString.length < 250) {
  keyBits = 1024;
} else if (keyString.length < 400) {
  keyBits = 2048;
} else {
  keyBits = 4096;
}
```

Ed25519 keys (~44 base64 chars) get a sentinel value of 256, not 1024. The weak key filter explicitly excludes Ed25519:
```typescript
const weak1024Keys = validKeys.filter(k => k.keyAlgo !== 'Ed25519' && k.keyBits === 1024);
```

The UI displays Ed25519 keys as `Ed25519 (≡ 3000+ bit RSA)` and never flags them as weak.

**Scoring:**
- 1+ keys found → 90 (pass)
- 1+ weak RSA 1024-bit keys → -20, status=warn
- Note: `let score = validKeys.length >= 1 ? 90 : 70` — the `70` branch is unreachable (if length is 0, we already returned early)

---

### 4.4 DMARC Check (`lib/checks/dmarc.ts`)

**What it does:**
1. `dns.resolveTxt('_dmarc.<domain>')`
2. Joins all TXT string chunks (TXT records can be split across multiple 255-byte strings)
3. Parses tag-value pairs using `indexOf('=')` to handle values containing `=`
4. Evaluates policy (`p=`), reporting (`rua=`, `ruf=`), alignment (`adkim=`, `aspf=`), and coverage (`pct=`)

**Tag parser:**
```typescript
const eqIdx = tag.indexOf('=');
if (eqIdx === -1) continue;
const key = tag.slice(0, eqIdx).trim();
const value = tag.slice(eqIdx + 1).trim();
```
This correctly handles any tag value that contains `=` (e.g., base64 in URIs).

**`pct=` factoring:**
When `pct < 100` and policy is `quarantine` or `reject`, the policy contribution is scaled:
```
effectiveFraction = pct / 100
score -= Math.round(policyScore × (1 - effectiveFraction))
```
A recommendation is added: "DMARC policy applies to only X% of messages — increase pct to 100 for full enforcement."
`p=none` with any `pct` is not additionally penalised (it's already monitoring-only).

**Scoring:**
- Base: 50 + policyScore (none=0, quarantine=50, reject=100)
- No `rua=`: -15
- Relaxed alignment: -10
- `pct < 100` with enforcing policy: proportional reduction of policy contribution
- Range: clamped 0–100

---

### 4.5 SMTP Check (`lib/checks/smtp.ts`)

**What it does:**
- Resolves MX records, resolves first 3 MX hostnames to IPv4 addresses
- That's it. No actual TCP/SMTP connection is attempted.

**Why:** Port 25 is commonly blocked by cloud providers (AWS, GCP, Cloudflare Workers). The check avoids false failures from network-level blocking.

**Scoring:**
- 1 MX → -10, warn
- Unresolved MX hostnames → -10 per batch (once, not per host)
- Base 100

**Design note:** The check is named "SMTP Connectivity" but doesn't test SMTP connectivity. It effectively duplicates much of what the MX check already does but with less information. This is a known design gap — Cloudflare Workers support outbound TCP via `connect()` so a real STARTTLS probe is technically possible.

---

### 4.6 Blacklist Check (`lib/checks/blacklist.ts`)

**What it does:**
1. Gets top 2 MX hostnames, resolves first IPv4 address of each
2. Falls back to domain's A record if no MX records
3. For each IP: calls `https://rbl-check.org/rbl_api.php?ipaddress=<ip>` with 30s timeout
4. **IPs checked in parallel** (`Promise.all`) — worst case is now 30s (single timeout window), not 60s
5. Parses semicolon-delimited response: `name;host;website;status`
6. Categorises listings as major (spamhaus, barracuda, spamcop, sorbs, nixspam) or minor

**API response format:**
```
SpamhausZen;zen.spamhaus.org;https://www.spamhaus.org;notlisted
SpamCop;bl.spamcop.net;https://www.spamcop.net;notlisted
...
```

**Reputation tier classification:**
Each result includes a `reputation_tier` field used by the multiplier system:
- `'clean'` — no listings
- `'minor_only'` — minor listings, no major
- `'major'` — exactly one major listing
- `'multi_major'` — two or more major listings
- `'unknown'` — check errored (no DNS penalty applied)

**Scoring (of the blacklist check card itself):**
- Base: 100
- -15 per major listing (capped at -60)
- -5 per minor listing (capped at -30)
- Combined minimum: 10

**Error handling:**
When `rbl-check.org` is unavailable, the catch block returns:
```typescript
{ status: 'fail', score: 0, details: { check_error: true, reputation_tier: 'unknown' } }
```
The UI shows "Check unavailable — no penalty applied" instead of misleading warn styling. The reputation multiplier reads `check_error` and applies `REPUTATION_MULTIPLIERS.unknown` (1.0) — no score penalty for uncertain results.

---

### 4.7 MTA-STS Check (`lib/checks/mta-sts.ts`)

**What it does:**
1. `dns.resolveTxt('_mta-sts.<domain>')` — looks for `v=STSv1; id=<id>`
2. Fetches `https://mta-sts.<domain>/.well-known/mta-sts.txt` with 10s timeout
3. Parses policy file line-by-line: `version`, `mode`, `mx`, `max_age`

**Policy file parser detail:**
The parser splits each line on `:` and joins the rest with `:` to handle values containing colons. This correctly handles lines like `mx: *.mail.example.com`.

**Scoring:**
- No TXT record → 0, fail
- TXT record but no/invalid policy file → 40, warn
- Policy present:
  - `mode=enforce` → score=100, pass
  - `mode=testing` → score=80, warn
  - `mode=none` → score=50, warn
  - `max_age < 604800` (1 week) → -10
  - No `mx:` entries → -20, warn

**Note:** The HTTPS fetch to `mta-sts.<domain>` doesn't validate the TLS certificate. An MTA-STS policy served over a broken TLS certificate would still score as valid.

---

### 4.8 TLS-RPT Check (`lib/checks/tls-rpt.ts`)

**What it does:**
1. `dns.resolveTxt('_smtp._tls.<domain>')` — looks for `v=TLSRPTv1`
2. Parses `rua=` (can be comma-separated list)
3. Validates each URI: `mailto:` (checks email regex), `https://` (assumed valid if prefix matches)

**Scoring:**
- No record → 0, fail
- Record found but unparseable → 40, warn
- Valid record:
  - Base 100
  - No valid ruas → 30, fail
  - Invalid ruas → -10 each, warn
  - No `mailto:` rua → recommendation only (no score penalty)

---

### 4.9 BIMI Record Check (`lib/checks/bimi.ts` — `checkBimiRecord`)

**What it does:**
1. `dns.resolveTxt('default._bimi.<domain>')`
2. Parses `v=`, `l=` (logo URL), `a=` (VMC URL)
3. Fetches the logo URL with 8s timeout (full GET, not HEAD)
4. Checks HTTP status and `Content-Type` for `svg`

**Accepts optional pre-fetched record:**
```typescript
export async function checkBimiRecord(domain: string, prefetched?: BimiParsed | null)
```
When called via `checkBimiAll()`, the DNS lookup is shared. When called individually (from `/api/scan/bimi_record`), it fetches its own copy.

**No BIMI record → status=warn, score=0** (not fail — BIMI is optional/aspirational)

**Scoring:**
- Base 100
- Invalid version tag (`!= BIMI1`) → -30
- Missing `l=` tag → -40
- Logo URL not HTTP 200 → -20
- Logo not SVG content-type → -10
- Status: fail if score < 60, warn otherwise

---

### 4.10 BIMI VMC Check (`lib/checks/bimi.ts` — `checkBimiVmc`)

**What it does:**
1. Fetches the BIMI record (accepts optional pre-fetched record to avoid duplicate DNS lookup)
2. If no `a=` tag → score=50, warn
3. If `a=` present: fetches the VMC URL, reads the body, checks for `-----BEGIN CERTIFICATE-----`

**Shared DNS lookup:**
`getBimiRecord()` is exported. `checkBimiAll(domain)` calls it once and passes the result to both `checkBimiRecord` and `checkBimiVmc`. Since the two checks are called from separate client requests (`/api/scan/bimi_record` and `/api/scan/bimi_vmc`), one duplicate DNS query is architectural when both endpoints are called. `checkBimiAll` eliminates it when called in the same request context.

**Scoring:**
- No BIMI record → score=0, warn
- BIMI record but no `a=` → score=50, warn
- `a=` present:
  - Base 100
  - Non-200 status → -30
  - Not PEM and not certificate Content-Type → -30
  - Status: fail if issues exist and score < 60

---

### 4.11 Compliance Check (`lib/checks/compliance.ts`)

**What it does:**
- Checks 3 privacy paths: `/privacy`, `/privacy-policy`, `/privacy-policy/`
- Checks 4 terms paths: `/terms`, `/terms-and-condition`, `/terms-and-conditions`, `/terms/`
- For each path: fetches both `https://domain/path` and `http://domain/path` **in parallel**
- All 14 fetches run in parallel via `Promise.all` — worst case drops from `14 × 8s` to `1 × 8s`
- Analyses the HTML body for: consent checkboxes, consent language, subscription forms

**Consent detection heuristics:**
- `looksLikeConsent`: looks for the word "cookie" + ("consent" OR "accept" OR "agree"), OR "i agree"/"i accept"/"opt-in"
- `hasConsentCheckbox`: checkbox present AND `looksLikeConsent()` must also return true (both required)
- `hasSubscriptionForm`: `<form>` + `type="email"` input, OR "subscribe"/"newsletter"/"sign up" in text

**Registration in scan flow:**
Compliance is registered in `checkFunctions` in `scan/[check]/route.ts` and runs in Wave 3 (alongside blacklist) in the results page. It is wired up in the UI with its own check card and section.

**Scoring:**
- Both privacy and terms missing → 0, fail
- Privacy missing → -30, warn
- Terms missing → -20, warn
- No consent signal → -10, warn
- Subscription form absent → recommendation only (no penalty)
- Max: 100

---

## 5. Score Architecture

### 5.1 Single Source of Truth

All scoring constants are defined in `lib/constants/scoring.ts` and imported by both the client-side results page and the server-side scan API:

```typescript
export const CHECK_WEIGHTS = { dmarc: 30, spf: 25, dkim: 25, mx: 10, smtp: 10 };

export const REPUTATION_MULTIPLIERS = {
  clean: 1.0,
  minor_only: 0.85,
  major: 0.5,
  multi_major: 0.25,
  unknown: 1.0,
};
```

### 5.2 Two-Stage Scoring Model

**Stage 1 — Configuration score:**
Weighted average of 5 core checks. During progressive loading, only completed checks contribute; the denominator normalises correctly so the score doesn't appear artificially low while checks are pending.

**Stage 2 — Reputation multiplier:**
Applied after Stage 1. `finalScore = Math.round(configScore × multiplier)`. The multiplier is driven by the `reputation_tier` field from the blacklist check result. While blacklist is loading or if it errored, `multiplier = 1.0` and `finalScore === configScore`.

### 5.3 Score Normalisation During Progressive Loading

```
Only DMARC (30) + SPF (25) loaded:
  score = (dmarc×30 + spf×25) / 55
```
The denominator is the sum of weights of completed checks, not 100. This normalises correctly — not showing a low score just because checks are pending.

### 5.4 Server-Side Score (`/api/scan`)

The full-scan endpoint (`app/api/scan/route.ts`) runs all checks including blacklist in parallel and applies the same two-stage formula. The `score` in the response is the post-multiplier value. This endpoint is not used by the progressive UI (which uses individual check endpoints) but is available for external callers and widget integrations.

---

## 6. Storage System

### 6.1 KV Storage (`lib/storage/kv.ts`)

**Data structure in KV:**
- Key: `user_projects:<base64url(userId)>`
- Value: JSON string of `UserProjects`:
  ```typescript
  {
    userId: string,       // Auth0 sub claim
    isPaid: boolean,      // manual flag, no payment integration
    projects: [{
      domain: string,     // lowercase
      addedAt: string,    // ISO timestamp
      lastScan: {
        timestamp: string,
        overallScore: number,   // post-multiplier finalScore
        results: Record<string, { status: string; score: number; details?: ... }>
      } | null
    }]
  }
  ```

**Saved `overallScore`** is the post-multiplier `finalScore`, not the raw config score.

**Free vs paid limits:**
- `FREE_PROJECT_LIMIT = 2` (constant in `lib/storage/interface.ts`)
- `isPaid` can only be set manually via direct KV manipulation or custom tooling. No payment flow connected.

**No optimistic locking:**
Every write does read → modify → write. Concurrent saves for the same user could overwrite. Cloudflare KV does not support conditional writes/ETags.

### 6.2 Storage Detection (`lib/storage/index.ts`)

```typescript
function isCloudflareWorker(): boolean {
  return typeof globalThis !== 'undefined' &&
    'caches' in globalThis &&
    typeof globalThis.caches === 'object' &&
    process.env.NODE_ENV === 'production';
}
```

The singleton `storageInstance` is safe in Cloudflare Workers: each isolate is single-threaded and processes requests sequentially — no shared-state race condition. Would need rethinking in a Node.js `worker_threads` context. `resetStorage()` exists for test teardown.

---

## 7. Authentication Flow

Auth0 v3 is used with `@auth0/nextjs-auth0`. The integration is the standard SDK pattern:

- **Login:** `GET /deliverability/api/auth/login` → Auth0 redirects → `GET /deliverability/api/auth/callback` → session cookie set → redirect to referrer
- **Logout:** `GET /deliverability/api/auth/logout` → clears cookie → redirects
- **Session:** Server-side `getSession()` reads the encrypted session cookie. Cookie is encrypted with `AUTH0_SECRET`.
- **Client detection:** The results page determines auth state by calling `GET /api/projects` and checking for 401.

The layout (`app/layout.tsx`) calls `getSession()` as a Server Component to show the logged-in user's name in the nav.

---

## 8. Usage Limiting

### 8.1 Anonymous Users

Cookie: `yeevu_scan_usage` → JSON `{ count: number, date: "YYYY-MM-DD" }`

**Daily reset:** `parseUsageData` compares `data.date` to today's ISO date. If different, resets to `{ count: 0, date: today }`. The date is server timezone (UTC in Cloudflare Workers).

**Increment flow:**
1. Preflight reads cookie → checks count
2. If allowed: returns 200, sets updated cookie in response
3. Cookie expires at `tomorrow.setHours(24, 0, 0, 0)` (midnight tonight, JavaScript date rollover)

**Security:** Cookie is `sameSite: lax` and not `httpOnly`. A user can manually edit the cookie to reset their count — known limitation of client-side rate limiting.

---

## 9. The Results Page UI — Key Details

### 9.1 Score Ring

The `ScoreRingDark` component renders 10 SVG arc segments. Score 0–100 maps to 0–10 segments (via `Math.round(score / 10)`). So a score of 85 shows 9/10 segments. The ring uses SVG arc paths with a 6° gap between segments. The displayed score is `finalScore` (post-multiplier).

### 9.2 Progressive Check Display

Each of the 11 checks has a `CheckCard`. While loading, it shows a skeleton (animated gray bars). Each check card is check-type-aware: it renders different detail layouts for MX (table of exchanges), SPF (lookup chain with broken include flags), DKIM (selector table with Ed25519 labelling), DMARC (policy breakdown with pct), etc.

### 9.3 Reputation Banner

When `reputationMultiplier < 1.0` and both `configScore` and `finalScore` are available, a red banner is shown between the score ring and action buttons:
> "Reputation Penalty Applied — Configuration score was X, reduced to Y due to a blacklist listing."

### 9.4 Check State vs Result State

`CHECK_WEIGHTS` covers only `dmarc`, `spf`, `dkim`, `mx`, `smtp`. The other checks (`blacklist`, `compliance`, `mta_sts`, `tls_rpt`, `bimi_record`, `bimi_vmc`) display results but don't contribute to the weighted config score. Blacklist drives the reputation multiplier instead. The others are informational only.

---

## 10. API Surface

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/scan/preflight` | GET | None | Validate domain + check usage limit |
| `/api/scan/[check]` | GET | None | Run individual check (11 check types) |
| `/api/scan` | GET/POST | None | Run all checks server-side (not used by UI) |
| `/api/widget/scan` | GET/POST | None (CORS *) | SPF+DKIM+DMARC only, embeddable |
| `/api/projects` | GET | Required | List user projects |
| `/api/projects` | POST | Required | Add project |
| `/api/projects/[domain]` | GET | Required | Get single project |
| `/api/projects/[domain]` | DELETE | Required | Remove project |
| `/api/projects/[domain]` | PUT | Required | Update project scan result |
| `/api/auth/[...auth0]` | GET | N/A | Auth0 handlers (login/callback/logout) |

Valid check types for `/api/scan/[check]`: `mx`, `spf`, `dkim`, `dmarc`, `smtp`, `mta_sts`, `tls_rpt`, `bimi_record`, `bimi_vmc`, `blacklist`, `compliance`

---

## 11. Bug Status (All Fixed)

| # | Bug | Severity | Status | Fix Summary |
|---|-----|----------|--------|-------------|
| 1 | Ed25519 DKIM keys false-flagged as weak | High | **Fixed** | Ed25519 gets `keyBits=256` sentinel; excluded from `weak1024Keys` filter; UI shows `Ed25519 (≡ 3000+ bit RSA)` |
| 2 | Compliance check is dead code | Medium | **Fixed** | Registered in `checkFunctions`, added to `ALL_CHECKS` in Wave 3, compliance card rendered in UI |
| 3 | `hasConsentCheckbox` always true on any checkbox | Medium | **Fixed** | Removed catch-all `return true`; checkbox must pass `looksLikeConsent()` to count |
| 4 | Duplicate DNS lookup in BIMI VMC check | Low | **Fixed** | `getBimiRecord` exported; both functions accept optional pre-fetched record; `checkBimiAll()` shares one lookup |
| 5 | DMARC `pct=` tag ignored in scoring | Low-Med | **Fixed** | `pct` proportionally reduces policy score for quarantine/reject; recommendation added when `pct < 100` |
| 6 | Blacklist API failure produces silent 50% score | Low-Med | **Fixed** | Error returns `check_error: true, reputation_tier: 'unknown'`; UI shows "Check unavailable"; multiplier = 1.0 (no penalty) |
| 7 | DMARC tag parser truncates values with `=` | Very Low | **Fixed** | Parser uses `indexOf('=')` + `slice()` instead of `split('=')` |
| 8 | SPF broken include counted as lookup with no visibility | Very Low | **Fixed** | `brokenIncludes[]` tracked through recursion; recommendations added per broken include; `hadError` flag on chain items |
| 9 | Score weights duplicated with no shared source | Low | **Fixed** | Single source in `lib/constants/scoring.ts`; both `results/page.tsx` and `scan/route.ts` import from it |

---

## 12. Scan Timing Profile

Expected timing for a typical scan (after parallelisation fixes):

| Phase | Duration | Notes |
|-------|----------|-------|
| Preflight DNS + auth check | ~50–300ms | `getSession` + domain resolve |
| Core checks (parallel wave 1) | ~200–800ms | DNS queries, fastest |
| Advanced checks (wave 2) | +100ms delay + ~500ms–3s | MTA-STS fetches policy file (10s timeout) |
| BIMI checks (wave 2) | ~500ms–2s | Fetches logo URL |
| Blacklist (wave 3) | ~200ms–30s | External API, IPs now parallel, single 30s timeout window |
| Compliance (wave 3) | ~200ms–8s | All 14 HTTP fetches now parallel (was 14 × 8s = 112s sequential worst case) |

**Worst case blacklist:** 30s (was 60s before IP parallelisation).
**Worst case compliance:** 8s (was 112s before path parallelisation).

---

## 13. Known Limitations and Missing Features

1. **No result caching** — scanning the same domain twice in quick succession runs all checks twice. No deduplication.
2. **No actual SMTP probe** — the "SMTP" check is a DNS-only MX resolution check, not an SMTP connectivity test.
3. **No certificate validation on MTA-STS** — the policy HTTPS fetch doesn't verify the TLS certificate.
4. **No scheduled rescans** — saved projects are only rescanned when the user manually visits the dashboard and clicks rescan.
5. **`isPaid` flag has no payment integration** — the paid status must be set manually; there's no Stripe/billing connection.
6. **No DKIM selector discovery** — the 11 hardcoded selectors miss any custom selector a domain might use (e.g., `2023`, `smtp`, `amazonses`).
7. **No IPv6 blacklist checking** — only IPv4 addresses are checked against RBLs.
8. **`/api/scan` full endpoint unused by UI** — the results page uses individual check endpoints for progressive loading; the full scan endpoint exists but is not connected to the main flow.
9. **BIMI duplicate DNS inherent in architecture** — `checkBimiAll()` solves it when used in the same context, but `/api/scan/bimi_record` and `/api/scan/bimi_vmc` are separate endpoints called from separate client requests, so one duplicate DNS query is unavoidable without combining them.
10. **Compliance `isPaid` path** — compliance results are informational only; they are not factored into the weighted score or the reputation multiplier.
