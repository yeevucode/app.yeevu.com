# YeevuPulse — Technical Architecture

---

## 1. Deployment Topology

```
Browser
  ↓
app.yeevu.com/email_warmup/*
  ↓
Cloudflare Worker: test-reverse-proxy
  ├── /email_warmup/* → proxied to pulse-yeevu.domains-12a.workers.dev (full path kept)
  └── everything else → origin cpde2.hostypanel.com
```

The Next.js app will use `basePath: '/email_warmup'` and `.env.production` will set `NEXT_PUBLIC_BASE_PATH=/email_warmup`, following the same pattern as `yeevu_inbox`.

---

## 2. Cloudflare Resources Required

| Resource | Name | Purpose |
|----------|------|---------|
| Worker | `pulse-yeevu` | Main Next.js app + cron execution |
| D1 Database | `pulse-db` | Matchmaking pool, conversation history, schedules |
| KV Namespace | `PULSE_KV` | Mailbox leases, credential encryption keys, user state |
| Worker Secret | `GEMINI_API_KEY` | Gemini API authentication |
| Worker Secret | `CREDENTIAL_ENCRYPTION_KEY` | AES-256 master key for mailbox credentials |

---

## 3. D1 Database Schema

### `mailbox_accounts`
```sql
CREATE TABLE mailbox_accounts (
  id           TEXT PRIMARY KEY,         -- UUID
  user_id      TEXT NOT NULL,            -- Auth0 sub
  email        TEXT NOT NULL UNIQUE,
  provider     TEXT NOT NULL,            -- 'gmail' | 'outlook' | 'imap'
  region       TEXT NOT NULL,            -- 'us-east' | 'eu-west' | etc.
  ip_cluster   TEXT,                     -- resolved sending IP subnet (/24)
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'active' | 'paused' | 'flagged'
  daily_max    INTEGER NOT NULL DEFAULT 5,
  day_count    INTEGER NOT NULL DEFAULT 0,  -- days active
  created_at   TEXT NOT NULL,
  -- Encrypted credential blob stored in KV, not here
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### `conversations`
```sql
CREATE TABLE conversations (
  id              TEXT PRIMARY KEY,      -- UUID
  sender_id       TEXT NOT NULL,         -- mailbox_accounts.id
  recipient_id    TEXT NOT NULL,         -- mailbox_accounts.id
  subject         TEXT NOT NULL,
  message_id      TEXT NOT NULL,         -- SMTP Message-ID of sent email
  in_reply_to     TEXT,                  -- Message-ID of parent (NULL for first turn)
  references_ids  TEXT,                  -- Space-separated chain of Message-IDs
  turn            INTEGER NOT NULL DEFAULT 1,  -- conversation depth
  status          TEXT NOT NULL DEFAULT 'sent',  -- 'sent' | 'delivered' | 'rescued' | 'replied'
  sent_at         TEXT NOT NULL,
  rescued_at      TEXT,
  FOREIGN KEY (sender_id) REFERENCES mailbox_accounts(id),
  FOREIGN KEY (recipient_id) REFERENCES mailbox_accounts(id)
);
```

### `daily_volume`
```sql
CREATE TABLE daily_volume (
  account_id  TEXT NOT NULL,
  date        TEXT NOT NULL,             -- ISO date YYYY-MM-DD
  sent        INTEGER NOT NULL DEFAULT 0,
  rescued     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, date),
  FOREIGN KEY (account_id) REFERENCES mailbox_accounts(id)
);
```

### `warmup_schedules`
```sql
CREATE TABLE warmup_schedules (
  account_id   TEXT PRIMARY KEY,
  day_1_limit  INTEGER NOT NULL DEFAULT 2,
  day_7_limit  INTEGER NOT NULL DEFAULT 15,
  day_14_limit INTEGER NOT NULL DEFAULT 40,
  throttle_factor REAL NOT NULL DEFAULT 1.0,  -- 0.5 when flagged
  FOREIGN KEY (account_id) REFERENCES mailbox_accounts(id)
);
```

---

## 4. KV Key Schema

| Key Pattern | Value | TTL | Purpose |
|-------------|-------|-----|---------|
| `lease:<account_id>` | `{ worker_id, acquired_at }` | 10 min | Mailbox lock — prevents concurrent access |
| `creds:<account_id>` | AES-256 encrypted JSON blob | None | Encrypted mailbox credentials |
| `region:<account_id>` | `"us-east"` | None | Region affinity for Regional Stickiness (FR7) |
| `throttle:<account_id>` | `{ factor, reason, until }` | Variable | Adaptive throttle state (FR14) |

---

## 5. Credential Encryption

Credentials are never stored in D1. Flow:

1. User submits OAuth tokens or IMAP credentials in UI.
2. Server generates a per-account AES-256 key, wrapped by the master `CREDENTIAL_ENCRYPTION_KEY` secret.
3. Encrypted blob stored in KV under `creds:<account_id>`.
4. To use credentials: decrypt with master key → get per-account key → decrypt blob.

This ensures credentials are never exposed even if D1 is dumped.

---

## 6. Matchmaking Algorithm

```
For each active account A:
  candidates = SELECT all active accounts WHERE:
    - id != A.id
    - ip_cluster NOT LIKE A.ip_cluster's /24
    - provider != A.provider  (cross-provider preferred; same allowed as fallback)
    - NOT lease:<id> exists in KV

  Prioritize candidates by:
    1. Different provider (gmail ↔ outlook ↔ zoho = higher score)
    2. Same region as A (for Regional Stickiness, FR7)
    3. Least recently paired (avoid repetition)

  Select top candidate B
  Acquire lease on both A and B
  Execute: A sends to B (or continues existing conversation thread)
```

---

## 7. Cron Trigger Design

Two separate cron triggers on the same Worker:

| Trigger | Schedule | Purpose |
|---------|----------|---------|
| `send-loop` | Every 5 min | Run matchmaker, send emails for due accounts |
| `rescue-loop` | Every 15 min | Scan Spam folders, move to Inbox, mark as read/starred |

Workers Cron Triggers are routed via the `scheduled()` handler. Each invocation:
1. Reads all active accounts from D1
2. Filters to accounts not currently leased
3. Checks daily volume against schedule limit
4. Executes send or rescue actions
5. Releases leases

---

## 8. AI Content Generation (Gemini)

- **Single-turn:** Prompt includes sender persona, recipient persona, and topic pool. Gemini returns subject + body.
- **Multi-turn (Phase 3):** Prompt includes full conversation history (subjects + truncated bodies). Gemini generates a contextually coherent reply.
- **Ephemeral:** Generated content is used immediately and not stored in D1. Only metadata (Message-ID, In-Reply-To, subject, status) is persisted.
- **Topic diversity:** A pool of ~20 topic categories (project updates, scheduling, industry news, etc.) is cycled to prevent repetition detection.

---

## 9. Ramp-up Schedule

```
Day 1–3:   2 emails/day
Day 4–7:   8 emails/day
Day 8–14: 20 emails/day
Day 15+:  40 emails/day (or user-configured daily_max)
```

Formula: `limit = MIN(schedule_for_day, account.daily_max)`

When `throttle_factor < 1.0` (FR14): `limit = FLOOR(limit × throttle_factor)`

---

## 10. IMAP/SMTP via Workers TCP

Cloudflare Workers support raw TCP via `connect()`. IMAP and SMTP commands will be implemented as lightweight state machines (no external Node.js IMAP/SMTP libraries — those don't run in Workers):

- **SMTP:** EHLO → STARTTLS → AUTH → MAIL FROM → RCPT TO → DATA → QUIT
- **IMAP:** LOGIN → SELECT "SPAM" → SEARCH UNSEEN → FETCH → MOVE → LOGOUT

For Gmail/Outlook OAuth providers, API-level access (Gmail REST API, Microsoft Graph) is preferred over raw IMAP where possible, as it avoids TCP complexity and is more reliable in a Worker environment.

---

## 11. Provider Strategy

| Provider | Send Method | Rescue Method |
|----------|-------------|---------------|
| Gmail | Gmail REST API (`messages.send`) | Gmail REST API (`messages.modify`, `labels`) |
| Google Workspace | Same as Gmail | Same as Gmail |
| Microsoft 365 | Microsoft Graph (`sendMail`) | Microsoft Graph (`move`, `flag`) |
| Custom IMAP/SMTP | Workers TCP `connect()` | Workers TCP IMAP |

OAuth tokens are refreshed automatically. Refresh tokens stored encrypted in KV.

---

## 12. Frontend Pages

| Route | Purpose |
|-------|---------|
| `/email_warmup/` | Landing / sign-in CTA |
| `/email_warmup/dashboard` | Health overview: inbox rate chart, pool stats |
| `/email_warmup/accounts` | List connected mailboxes, add new |
| `/email_warmup/accounts/connect` | OAuth flow entry point / manual IMAP form |
| `/email_warmup/accounts/[id]` | Per-account details: daily volume chart, conversation log |
| `/email_warmup/settings` | Daily max, domain blacklist, pause all |
| `/email_warmup/api/auth/[...auth0]` | Auth0 handlers |
| `/email_warmup/api/accounts` | CRUD for mailbox accounts |
| `/email_warmup/api/cron/send` | Internal — invoked by Worker scheduled() |
| `/email_warmup/api/cron/rescue` | Internal — invoked by Worker scheduled() |
| `/email_warmup/api/oauth/gmail/callback` | Gmail OAuth callback |
| `/email_warmup/api/oauth/outlook/callback` | Outlook OAuth callback |
