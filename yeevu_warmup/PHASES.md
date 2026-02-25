# YeevuPulse — Implementation Phases

---

## Phase 1: MVP — "The Internal Mesh"

**Goal:** Prove the loop works end-to-end with internal seed accounts only. No external users.

### Deliverables

#### Infrastructure
- [ ] Create Cloudflare D1 database `pulse-db` with schema from ARCHITECTURE.md
- [ ] Create Cloudflare KV namespace `PULSE_KV`
- [ ] Create new Cloudflare Worker `pulse-yeevu` (Next.js via opennextjs-cloudflare)
- [ ] Configure `test-reverse-proxy` to route `/email_warmup/*` to `pulse-yeevu`
- [ ] Set `basePath: '/email_warmup'` in `next.config.mjs`

#### Backend
- [ ] D1 ORM layer (`lib/db/`) with typed query helpers
- [ ] KV lease manager (`lib/leases/`) — acquire/release with TTL
- [ ] Credential encryption module (`lib/crypto/`) — AES-256 wrap/unwrap
- [ ] Gmail REST API client (`lib/providers/gmail.ts`) — send, move-from-spam, mark-read
- [ ] Microsoft Graph client (`lib/providers/outlook.ts`) — send, move-from-spam, flag
- [ ] Matchmaker (`lib/matchmaker/`) — collision avoidance, cross-provider prioritization
- [ ] Ramp-up scheduler (`lib/scheduler/`) — day-based volume calculation
- [ ] Gemini content generator (`lib/ai/`) — single-turn subject + body generation
- [ ] Send loop (`app/api/cron/send/route.ts`) — matchmaker → lease → send → log
- [ ] Rescue loop (`app/api/cron/rescue/route.ts`) — IMAP scan → move → mark → log
- [ ] Worker `scheduled()` handler wiring both cron routes

#### Seed Account Setup
- [ ] Manual script to register 50 internal seed accounts directly into D1/KV
- [ ] Mix of Gmail and Outlook accounts across at least 3 IP subnets

#### Minimal UI
- [ ] `/email_warmup/dashboard` — internal-only view: total sent today, rescue rate, active accounts
- [ ] Auth0 integration (same pattern as yeevu_inbox)

### Success Criteria
- 50+ seed accounts active
- Send loop executes without collision errors
- Rescue loop successfully moves spam-folder emails to inbox
- In-network inbox rate > 80% after 14 days

---

## Phase 2: Beta — "The Community Mesh"

**Goal:** Open to external users. Users connect their own mailboxes. Lease logic handles scale.

### Deliverables

#### Onboarding Flow
- [ ] Gmail OAuth2 consent screen + callback (`/email_warmup/api/oauth/gmail/callback`)
- [ ] Microsoft OAuth2 consent screen + callback (`/email_warmup/api/oauth/outlook/callback`)
- [ ] Manual IMAP/SMTP form with connection test (Workers TCP `connect()`)
- [ ] Account list page (`/email_warmup/accounts`)
- [ ] Per-account detail page with daily volume chart

#### Control UI
- [ ] Start/pause toggle per account
- [ ] "Daily Max" slider
- [ ] Domain blacklist input

#### Backend Scaling
- [ ] OAuth token refresh logic (Gmail + Outlook)
- [ ] Adaptive throttling: detect flagged accounts via bounce/spam feedback, apply 0.5× factor
- [ ] Per-user project limits (free vs paid, same pattern as yeevu_inbox)
- [ ] Rate limiting on API routes

### Success Criteria
- External users can connect Gmail and Outlook accounts end-to-end
- Lease system prevents concurrent mailbox access under concurrent cron runs
- Pool size > 500 accounts

---

## Phase 3: Scaling — "The AI Threading"

**Goal:** Multi-turn conversations, regional stickiness, production hardening.

### Deliverables

#### AI Threading (FR9)
- [ ] Store `In-Reply-To` + `References` chain per conversation in D1
- [ ] Gemini multi-turn prompt: include previous turn subjects and truncated bodies
- [ ] Reply routing: when a conversation has < 5 turns, prefer continuing it over starting new
- [ ] Thread depth cap: close conversation at turn 5, mark complete

#### Regional Stickiness (FR7)
- [ ] Detect client region at account registration time (CF-IPCountry / CF-Ray region)
- [ ] Store region affinity in `region:<account_id>` KV key
- [ ] Matchmaker: strongly prefer pairing accounts handled by same Worker region
- [ ] Cron trigger configuration: set per-region cron triggers if Cloudflare supports it; otherwise use KV region tag as soft filter

#### Custom IMAP/SMTP (FR3)
- [ ] Workers TCP SMTP state machine (EHLO → STARTTLS → AUTH → MAIL FROM → DATA → QUIT)
- [ ] Workers TCP IMAP state machine (LOGIN → SELECT → SEARCH → FETCH → MOVE → LOGOUT)
- [ ] Test harness for TCP state machines against a real IMAP server

#### Production
- [ ] Metrics dashboard: In-Network Inbox Rate, Time-to-Warm, Pool Diversity
- [ ] Alerting: notify admin if rescue rate drops below 60%
- [ ] Log retention: purge conversations older than 90 days
- [ ] Privacy audit: confirm no real email bodies are ever persisted

### Success Criteria
- Multi-turn conversations (3+ turns) comprise > 50% of all interactions
- Regional stickiness prevents "impossible travel" security alerts
- Custom IMAP/SMTP accounts functional end-to-end
- Time-to-Warm median < 14 days for new domains

---

## Open Questions / Decisions Needed Before Phase 1

1. **OAuth App Registration:** Gmail and Outlook OAuth require registered apps with verified redirect URIs. Need client IDs/secrets before any OAuth flow can be built.
2. **Gemini API access:** Confirm API key and quota tier. Single-turn generation for 50 seed accounts at 5 min intervals = ~14,400 calls/day at scale.
3. **Seed account sourcing:** Who provisions the 50 internal seed accounts? What mix of Gmail/Outlook?
4. **Paid tier definition:** What does "paid" unlock (more accounts? higher daily max?)
5. **`test-reverse-proxy` update:** Worker needs a new routing rule for `/email_warmup/*` before the app is reachable.
6. **Domain for OAuth callbacks:** Callbacks must go to `app.yeevu.com/email_warmup/api/oauth/...`. Confirm this is acceptable for both Google and Microsoft OAuth app verification.
