# YeevuDNS — Product Requirements Document

## Domains & Deployment

| | Now | Future |
|---|---|---|
| App | `app.yeevu.com/yeevu_dns` | `app.yeevudns.com` |
| API | `app.yeevu.com/yeevu_dns/api` | `api.yeevudns.com` |
| Landing | — | `yeevudns.com` |
| Nameservers | Cloudflare default | `ns1.yeevudns.com` / `ns2.yeevudns.com` (Cloudflare Vanity NS) |

> `yeevudns.com` is reserved. Migration happens when the product is ready to stand alone.

---

## Vision

YeevuDNS is a DNS management platform that abstracts the complexity of DNS configuration
behind a clean API, a catalog of integrations, and a natural language interface.
Non-technical users can manage DNS with plain English. Developers and partners can
build their own integrations on top of the core API.

---

## Problem

Managing DNS is technical, error-prone, and opaque to non-technical users. Existing
tools (Cloudflare, registrar dashboards) expose raw DNS primitives — A records, TXT
records, Zone IDs — that most users don't understand.

YeevuDNS solves this by:
- Abstracting Cloudflare Zone IDs and raw DNS record types from users
- Providing named, purpose-built integrations (e.g. "point to Wix", "setup Google email")
- Exposing a plain English interface via an NLP router
- Allowing clients to build and publish their own integrations

---

## Architecture

```
Plain English Input
        ↓
   NLP Router          — maps intent to an integration + extracts params
        ↓
 Integration Engine    — executes a named sequence of Core DNS API calls
        ↓
  Core DNS API         — CRUD primitives for DNS record types
        ↓
   Cloudflare API      — underlying DNS infrastructure
```

Each layer has a single responsibility and can evolve independently.

---

## User Model

- Users sign up for a Yeevu account
- During onboarding, they point their domain's nameservers to Yeevu's Cloudflare nameservers
- Yeevu detects the nameserver change and stores the domain → Cloudflare Zone ID mapping internally
- Users never see or handle a Zone ID — it is resolved from their account session
- All DNS operations are scoped to the authenticated user's domains

---

## Layer 1: Core DNS API

The foundational layer. Fixed, inflexible, primitive DNS CRUD operations.
No business logic. No platform knowledge.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/domains` | List domains on the account |
| GET | `/domains/:domain/records` | List all DNS records for a domain |
| POST | `/domains/:domain/records/a` | Create A record |
| PUT | `/domains/:domain/records/a/:id` | Update A record |
| DELETE | `/domains/:domain/records/a/:id` | Delete A record |
| POST | `/domains/:domain/records/mx` | Create MX record |
| PUT | `/domains/:domain/records/mx/:id` | Update MX record |
| DELETE | `/domains/:domain/records/mx/:id` | Delete MX record |
| POST | `/domains/:domain/records/txt` | Create TXT record |
| PUT | `/domains/:domain/records/txt/:id` | Update TXT record |
| DELETE | `/domains/:domain/records/txt/:id` | Delete TXT record |
| POST | `/domains/:domain/records/cname` | Create CNAME record |
| PUT | `/domains/:domain/records/cname/:id` | Update CNAME record |
| DELETE | `/domains/:domain/records/cname/:id` | Delete CNAME record |

### Design Rules
- All endpoints resolve Zone ID internally from the domain name — never exposed to callers
- All operations are scoped to the authenticated account — cross-domain access is blocked
- Responses always return the record ID, type, name, content, TTL, and status

---

## Layer 2: Integration Engine

Integrations are named, versioned recipes — predefined sequences of Core DNS API calls
with known parameters. They encode the knowledge of what DNS records each platform requires.

### Integration Schema

```json
{
  "id": "setup/email/google-workspace",
  "name": "Setup Google Workspace Email",
  "description": "Configures MX, SPF, and DMARC records for Google Workspace",
  "params": [
    { "name": "domain", "required": true },
    { "name": "dmarc_rua", "required": false, "default": "" }
  ],
  "steps": [
    { "action": "delete_existing", "type": "mx" },
    { "action": "create", "type": "mx", "content": "aspmx.l.google.com", "priority": 1 },
    { "action": "create", "type": "mx", "content": "alt1.aspmx.l.google.com", "priority": 5 },
    { "action": "delete_existing", "type": "txt", "name": "@", "match": "v=spf1" },
    { "action": "create", "type": "txt", "name": "@", "content": "v=spf1 include:_spf.google.com ~all" },
    { "action": "create", "type": "txt", "name": "_dmarc", "content": "v=DMARC1; p=none; rua={{dmarc_rua}}" }
  ]
}
```

### Built-in Integrations (Phase 1)

Derived from the existing N8N workflow:

**Website / Hosting**
- `setup/website/wix`
- `setup/website/squarespace`
- `setup/website/shopify`

**Email**
- `setup/email/google-workspace`
- `setup/email/microsoft-365`
- `setup/email/zoho`
- `setup/email/mxroute`
- `setup/email/mailgun`
- `setup/email/sendgrid`
- `setup/email/mailchimp`

**Email DNS Records (standalone)**
- `setup/spf` — custom SPF configuration
- `setup/dmarc` — custom DMARC configuration
- `setup/dkim` — custom DKIM record

### Integration API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/integrations` | List all available integrations |
| GET | `/integrations/:id` | Get integration schema and params |
| POST | `/integrations/:id/run` | Execute an integration against a domain |

---

## Layer 3: NLP Router

A lightweight AI layer that maps plain English input to an integration call.
It is a router — not a general-purpose assistant.

### Responsibilities
- Classify user intent → select the matching integration from the catalog
- Extract parameters from the input (domain, email addresses, etc.)
- If domain is not in the input, resolve it from the user's session
- If intent is ambiguous → ask a clarifying question
- If no integration matches → respond: "I don't support that yet"

### What it is NOT
- Not a general DNS assistant
- Not capable of raw DNS manipulation via natural language
- Does not generate DNS records — only selects from the fixed catalog

### Implementation
- Claude function calling with the integration catalog as tools
- Each integration's `id`, `name`, `description`, and `params` are passed as tool definitions
- Model selects a tool (integration) and extracts param values
- High confidence → execute immediately
- Low confidence → confirm with user before executing

### Example

```
Input:  "my emails are going to spam, set up Google email for me"
Router: intent = setup/email/google-workspace
        domain = resolved from session
        dmarc_rua = not provided, use default
Action: POST /integrations/setup/email/google-workspace/run
        { domain: "example.com" }
```

---

## Layer 4: Integration Builder (Phase 2)

Allows Yeevu clients and partners to define and publish their own integrations.

### Use Cases
- An agency creates `setup/agency-hosting` pointing to their server IPs
- A SaaS creates `setup/deploy-on-saas` for automatic DNS on customer onboarding
- Yeevu's own app builder creates `setup/yeevu-app` for auto-deploy DNS configuration

### Features
- Define integrations via JSON schema (same format as built-in integrations)
- Integrations are scoped to the creating account by default
- Option to publish to the shared catalog (reviewed by Yeevu)
- Integration validation — steps are checked against allowed Core API operations
- No arbitrary DNS manipulation — steps must map to Core API primitives

### Integration Builder API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/my/integrations` | List client's own integrations |
| POST | `/my/integrations` | Create a new integration |
| PUT | `/my/integrations/:id` | Update an integration |
| DELETE | `/my/integrations/:id` | Delete an integration |
| POST | `/my/integrations/:id/publish` | Submit for public catalog |

---

## Security Model

- All API calls require authentication (Yeevu account session or API key)
- Zone IDs are never returned in API responses or exposed to clients
- Integration steps are validated against a whitelist of allowed Core API operations
- Client-created integrations can only run against domains the client owns
- Published integrations in the public catalog are reviewed before listing

---

## Build Phases

### Phase 1 — Internal (Foundation)
- Core DNS API
- Built-in integrations (from existing N8N workflow)
- User/domain account model
- Replace N8N workflow with YeevuDNS API calls internally

### Phase 2 — NLP Router
- Claude function calling on integration catalog
- Plain English interface for existing Yeevu customers
- Connected to yeevu_inbox and dns-email-resolver products

### Phase 3 — Platform (Open to Clients)
- Integration builder API
- Client API keys
- Public integration catalog
- Documentation and developer portal

---

## Success Metrics

- Phase 1: N8N workflow fully replaced by YeevuDNS API
- Phase 2: Customers can resolve email DNS issues via plain English with zero errors
- Phase 3: At least one external integration published by a client partner

---

## Out of Scope

- Domain registration
- Nameserver management (handled at registrar level by customer)
- SSL certificate provisioning
- Non-Cloudflare DNS providers (Phase 1)
