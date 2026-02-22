# YeevuInbox

**Email Deliverability Checker** — Know your email will land in the inbox.

A comprehensive email deliverability scanner deployed at `app.yeevu.com/deliverability/`. It performs 11 distinct checks against a domain's DNS configuration, scores the results using a two-stage weighted formula, and presents them progressively in a browser UI. Authenticated users can save domains as projects for later rescanning.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Cloudflare Workers via `@opennextjs/cloudflare` · Auth0 v3 · Cloudflare KV

---

## Features

- **11 Checks** — MX, SPF, DKIM, DMARC, SMTP, MTA-STS, TLS-RPT, BIMI (record + VMC), Blacklist, Compliance
- **Two-Stage Scoring** — Weighted configuration score (DMARC 30 / SPF 25 / DKIM 25 / MX 10 / SMTP 10) × reputation multiplier from blacklist result
- **Progressive UI** — Results stream in as checks complete; score ring updates live
- **Reputation Multiplier** — Blacklist listing drops the final score visibly after config score is established (intentional UX)
- **Anonymous Scans** — 3 free scans per day via cookie-based usage tracking (no account required)
- **Auth0 Login** — Authenticated users get unlimited scans and project saving via Cloudflare KV
- **Embeddable Widget** — CORS-enabled `/api/widget/scan` endpoint for third-party embeds
- **Domain Blocklist** — Configurable via `BLOCKED_DOMAINS` env var with wildcard support

---

## Quick Start

### Local Development

```bash
cp .env.example .env.local
# Fill in AUTH0_* values — leave AUTH0_BASE_URL as http://localhost:3000
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Type Check

```bash
npm run type-check
```

### Lint

```bash
npm run lint
```

---

## Deployment (Cloudflare Workers)

```bash
# Build and deploy in one step
npm run deploy
```

This runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy`.

**Required Cloudflare secrets** (set via `wrangler secret put`):

```
AUTH0_SECRET
AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET
AUTH0_ISSUER_BASE_URL
```

**`wrangler.toml` vars:**

```toml
NEXT_PUBLIC_BASE_PATH = "/deliverability"
AUTH0_BASE_URL = "https://app.yeevu.com/deliverability"
```

**`.env.production`** (build-time, inlines `NEXT_PUBLIC_BASE_PATH` into client bundle):

```env
NEXT_PUBLIC_BASE_PATH=/deliverability
```

---

## Project Structure

```
yeevu_inbox/
├── app/
│   ├── page.tsx                    # Home — domain input form
│   ├── results/page.tsx            # Results — progressive check display + scoring
│   ├── dashboard/page.tsx          # Saved projects dashboard
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── scan/
│       │   ├── route.ts            # POST /api/scan — full parallel scan
│       │   ├── [check]/route.ts    # GET /api/scan/<check> — individual check
│       │   ├── preflight/route.ts  # GET /api/scan/preflight — auth + usage gate
│       │   └── blacklist/route.ts  # GET /api/scan/blacklist — standalone blacklist
│       ├── projects/
│       │   ├── route.ts            # GET/POST /api/projects
│       │   └── [domain]/route.ts   # DELETE /api/projects/:domain
│       ├── widget/scan/route.ts    # POST /api/widget/scan — CORS-enabled embed
│       └── auth/[...auth0]/route.ts
├── lib/
│   ├── checks/
│   │   ├── mx.ts
│   │   ├── spf.ts
│   │   ├── dkim.ts
│   │   ├── dmarc.ts
│   │   ├── smtp.ts
│   │   ├── mta-sts.ts
│   │   ├── tls-rpt.ts
│   │   ├── bimi.ts
│   │   ├── blacklist.ts
│   │   └── compliance.ts
│   ├── constants/
│   │   └── scoring.ts              # CHECK_WEIGHTS, REPUTATION_MULTIPLIERS (single source of truth)
│   ├── scanner/index.ts            # Orchestrator for full parallel scans
│   ├── storage/
│   │   ├── index.ts                # Singleton storage factory
│   │   ├── kv.ts                   # Cloudflare KV adapter
│   │   ├── file.ts                 # Local file adapter (dev)
│   │   └── interface.ts
│   ├── types/scanner.ts
│   └── utils/
│       ├── validate.ts             # isValidDomain()
│       ├── id.ts                   # generateScanId()
│       ├── blocklist.ts            # isDomainBlocked(), patternToRegex()
│       └── usage-limit.ts          # Cookie-based anonymous usage tracking
├── .env.example
├── next.config.mjs
├── open-next.config.ts
├── wrangler.toml
├── tsconfig.json
└── package.json
```

---

## Scoring Formula

### Stage 1 — Configuration Score

Weighted average of 5 core checks (defined in `lib/constants/scoring.ts`):

| Check | Weight | Rationale |
|-------|--------|-----------|
| DMARC | 30% | Capstone — hardest to configure correctly |
| SPF   | 25% | Equal foundation |
| DKIM  | 25% | Equal foundation |
| MX    | 10% | Infrastructure verification |
| SMTP  | 10% | Infrastructure verification |

Score normalises correctly during progressive loading: denominator is the sum of weights for *completed* checks only.

### Stage 2 — Reputation Multiplier

Applied after the configuration score based on the blacklist result:

| Tier | Multiplier | Condition |
|------|-----------|-----------|
| `clean` | 1.0 | No listings |
| `minor_only` | 0.85 | Listed on minor blocklists only |
| `major` | 0.5 | Listed on one major blocklist |
| `multi_major` | 0.25 | Listed on 2+ major blocklists |
| `unknown` | 1.0 | Check errored — no penalty for uncertainty |

`finalScore = Math.round(configScore × multiplier)`

A red banner is shown when `multiplier < 1.0`:
> "Reputation Penalty Applied — Configuration score was X, reduced to Y due to a blacklist listing."

---

## API Reference

### `GET /api/scan/preflight?domain=<domain>`

Usage and blocklist gate. Returns:
- `{ allowed: true, authenticated: true, unlimited: true }` — logged-in user
- `{ allowed: true, authenticated: false, remaining: N, limit: 3 }` — anonymous, within limit
- `403 { error, limitReached: true }` — anonymous, limit reached
- `403 { error, blocked: true }` — domain is blocked

### `GET /api/scan/<check>?domain=<domain>`

Run a single check. `<check>` is one of:
`mx` · `spf` · `dkim` · `dmarc` · `smtp` · `mta_sts` · `tls_rpt` · `bimi_record` · `bimi_vmc` · `blacklist` · `compliance`

Returns:
```json
{
  "check": "spf",
  "domain": "example.com",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "result": { "status": "pass", "score": 90, "details": {}, "recommendations": [] }
}
```

### `POST /api/scan`

Full parallel scan. Returns all check results and the post-multiplier `score`.

### `GET /api/projects` · `POST /api/projects` · `DELETE /api/projects/:domain`

Project management (requires Auth0 session). Projects stored in Cloudflare KV under `user_projects:<base64url(userId)>`.

### `POST /api/widget/scan` (CORS-enabled)

Embeddable widget endpoint. Returns scan results for third-party domains.

---

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```env
# Auth0 (required)
AUTH0_SECRET=<long-random-string>
AUTH0_ISSUER_BASE_URL=https://auth.yeevu.com
AUTH0_CLIENT_ID=<client-id>
AUTH0_CLIENT_SECRET=<client-secret>

# Local dev
AUTH0_BASE_URL=http://localhost:3000
NEXT_PUBLIC_BASE_PATH=

# Domain blocklist (optional)
# Supports exact, *.prefix, and suffix.* patterns
BLOCKED_DOMAINS=malicious.com,*.spam.net
```

---

## Check Details

### MX
- Resolves MX records; parallel IPv4+IPv6 A/AAAA resolution per host
- RFC fallback: A/AAAA used if no MX present (RFC 5321)
- Scores redundancy: 2+ MX → 100, 1 MX → 85, none → 0

### SPF
- Recursive include/redirect follower with cycle detection (Set-based)
- Counts DNS lookups against RFC 7208 §4.6.4 limit of 10
- Reports broken includes (failed DNS resolution) as separate recommendations
- `-all` strict qualifier earns a +10 bonus

### DKIM
- Probes 11 common selectors: `default`, `mail`, `selector1`, `selector2`, `s1`, `s2`, `k1`, `k2`, `google`, `dkim`, `x`
- Ed25519 keys correctly identified (never false-flagged as weak 1024-bit RSA)
- UI label: `Ed25519 (≡ 3000+ bit RSA)`
- RSA key strength estimated from base64 length: <250 chars → 1024-bit, <400 → 2048-bit, else → 4096-bit

### DMARC
- Full tag parser using `indexOf('=')` — handles base64 values that contain `=`
- `pct=` value reduces the effective policy score proportionally when `pct < 100`
- Checks `rua`/`ruf` reporting addresses, alignment modes, and policy strength

### SMTP
- Tests TCP on port 25; EHLO capability inspection; STARTTLS negotiation; TLS certificate validation

### MTA-STS / TLS-RPT / BIMI
- Standard DNS TXT lookups; BIMI VMC check shares a single DNS fetch with the record check

### Blacklist
- Checks mail server IPs in parallel against DNS-based blocklists
- API failure returns `check_error: true` and `reputation_tier: 'unknown'` (multiplier 1.0 — no penalty for uncertainty)

### Compliance
- Fetches homepage and common policy paths in parallel; checks for privacy policy, unsubscribe links, consent checkboxes, and GDPR/CAN-SPAM indicators

---

## License

MIT — see [LICENSE](LICENSE)
