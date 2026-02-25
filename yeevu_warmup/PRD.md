# YeevuPulse — Product Requirements Document

**Version:** 1.0
**Status:** Draft / Technical Specification
**Owner:** Product Engineering

---

## 1. Executive Summary

YeevuPulse is an automated deliverability remediation service. While YeevuInbox identifies configuration issues, YeevuPulse fixes reputation issues by simulating a high-trust "Conversation Mesh." It uses AI-generated peer-to-peer interactions to ensure user emails are opened, replied to, and rescued from spam folders globally.

---

## 2. Target Audience

- **SDRs/BDRs:** Sales teams setting up "burn" domains for cold outreach.
- **Founders:** Early-stage startups needing to establish domain authority.
- **Newsletter Operators:** Senders migrating to new IPs or domains.

---

## 3. Functional Requirements

### 3.1 Inbox Integration (The Gateway)

- **FR1:** Support for Gmail/Google Workspace via OAuth2 or App Passwords.
- **FR2:** Support for Microsoft 365/Outlook via OAuth2 or App Passwords.
- **FR3:** Manual IMAP/SMTP configuration for custom/private mail servers.
- **FR4:** Secure credential storage using AES-256 encryption within Cloudflare Secrets/KV.

### 3.2 The Matchmaking Engine (The Traffic Controller)

- **FR5:** Collision Avoidance — Prevent same-domain or same-IP-cluster interactions.
- **FR6:** Provider Cross-Pollination — Prioritize Google-to-Outlook and Outlook-to-Zoho interactions to maximize cross-provider reputation.
- **FR7:** Regional Stickiness — Ensure a single user account is always handled by a worker in the same geographic region (e.g., US-East) to avoid "impossible travel" security alerts.

### 3.3 The Conversation Engine (AI Simulator)

- **FR8:** Integration with Gemini API to generate contextually relevant, non-repetitive email bodies and subjects.
- **FR9:** Threading — The system must track `In-Reply-To` and `References` headers to simulate multi-step conversations (High-Trust Signal).

### 3.4 The "Rescue" Loop (Automated Remediation)

- **FR10:** Programmatic scanning of Spam and Junk folders via IMAP.
- **FR11:** Automated "Not Spam" action: Moving items from Spam to Inbox.
- **FR12:** Engagement simulation: Marking messages as "Important," "Starred," and "Read."

### 3.5 The Ramp-up Scheduler

- **FR13:** Automatic volume scaling (e.g., Day 1: 2 emails; Day 14: 40 emails).
- **FR14:** Adaptive throttling — If a domain is flagged, automatically reduce volume by 50% until reputation stabilizes.

---

## 4. Technical Architecture (The Stack)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Database | Cloudflare D1 | Relational storage for Matchmaking Pool and Conversation History |
| State/Locking | Cloudflare KV | High-speed "Leases" to prevent concurrent mailbox access |
| Execution | Cloudflare Workers + Cron | Distributed cron triggers every 1–5 minutes |
| Connectivity | Workers `connect()` (TCP) | Raw SMTP/IMAP commands |
| AI | Gemini API | Email body/subject generation |
| Frontend | Next.js 15 (App Router) | Dashboard UI via opennextjs-cloudflare |

---

## 5. User Experience

### 5.1 The "Health" Dashboard

- Visual representation of the domain's reputation over time.
- "Spam vs. Inbox" placement chart based on internal Yeevu network data.

### 5.2 The "Warm-up Control"

- Toggle to start/pause the simulator.
- Customizable "Daily Max" sending limits.
- "Blacklist" field to exclude specific domains from the interaction pool.

---

## 6. Success Metrics (KPIs)

| KPI | Description |
|-----|-------------|
| In-Network Inbox Rate | Avg % of warm-up emails landing in Inbox across the entire mesh |
| Time-to-Warm | Days required for a new domain to reach 95% Inbox placement |
| Pool Diversity | Unique IP subnets and provider types active in the mesh |

---

## 7. Security & Compliance

- **Data Privacy:** All AI-generated email content must be ephemeral. Yeevu must not store bodies of real user emails — only metadata of warm-up emails.
- **OAuth Scopes:** Request minimum viable permissions (`gmail.modify` or `Mail.ReadWrite`).
- **Credential Storage:** AES-256 encryption; credentials stored in Cloudflare Secrets/KV, never in D1 plaintext.

---

## 8. Phases of Development

### Phase 1: MVP — "The Internal Mesh"

- Build the D1 Matchmaker.
- Connect 50 internal "Seed" accounts.
- Execute Send/Rescue loop via Workers Cron.

### Phase 2: Beta — "The Community Mesh"

- Open the UI to external users to connect their own accounts.
- Implement the "Lease" logic in KV to handle user-scale collisions.

### Phase 3: Scaling — "The AI Threading"

- Implement Gemini-driven multi-turn conversations.
- Add Regional Stickiness logic to avoid security blocks.
