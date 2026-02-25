# YeevuPulse — Autonomous Email Warm-up & Simulator

**Status:** Planning / Pre-implementation
**Deployment target:** `app.yeevu.com/email_warmup/` (Cloudflare Workers via opennextjs-cloudflare)

YeevuPulse is the deliverability remediation complement to YeevuInbox. Where YeevuInbox *identifies* configuration issues, YeevuPulse *fixes* reputation issues by simulating a high-trust "Conversation Mesh."

---

## Documentation Index

| File | Description |
|------|-------------|
| [PRD.md](PRD.md) | Full product requirements document |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical architecture & data models |
| [PHASES.md](PHASES.md) | Phased implementation roadmap |

---

## Quick Summary

- **What it does:** Automates email warm-up via AI-generated peer-to-peer interactions across a pool of connected mailboxes.
- **Stack:** Next.js (App Router) · Cloudflare Workers · D1 (relational) · KV (leases/state) · Gemini API · Workers Cron Triggers · TCP sockets (`connect()`) for IMAP/SMTP.
- **Auth integrations:** Gmail OAuth2, Microsoft 365 OAuth2, manual IMAP/SMTP.
- **Deployment pattern:** Same as `yeevu_inbox` — Next.js built with opennextjs-cloudflare, deployed as a Cloudflare Worker.
