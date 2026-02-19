# YeevuInbox

**Email Deliverability Checker** — Know your email will land in the inbox.

A comprehensive email deliverability scanner that checks MX records, SPF, DKIM, DMARC, and SMTP connectivity to give domain owners actionable insights on their email infrastructure health.

---

## Features

- **MX Record Validation** – Verify MX records, redundancy, and proper A/AAAA resolution
- **SPF Analysis** – Check SPF syntax, lookup counts, and qualification policies
- **DKIM Detection** – Find DKIM public keys and validate key strength (1024/2048-bit)
- **DMARC Policy Review** – Inspect DMARC policy, rua/ruf addresses, and alignment modes
- **SMTP Connectivity** – Test SMTP connect, EHLO capabilities, STARTTLS support, TLS certificate validation
- **Detailed Reports** – Per-check results with actionable remediation steps
- **Score & Recommendations** – Deterministic scoring formula with transparent logic
- **Domain Verification** – Require ownership verification before advanced checks
- **API & Embed Support** – REST API for integrations + CORS-enabled widget endpoint
- **Privacy-First** – No unsolicited outbound emails; DNS-only by default

---

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run Tests

```bash
npm test
```

---

## API Endpoints

### POST /api/scan

Trigger a full deliverability scan on a domain.

**Request:**
```json
{
  "domain": "example.com",
  "checks": ["mx", "spf", "dkim", "dmarc", "smtp"],
  "options": {
    "dkim_selectors": ["default", "mail"],
    "smtp_timeout": 10000
  }
}
```

**Response:**
```json
{
  "scan_id": "scan_abc123",
  "domain": "example.com",
  "status": "pending",
  "created_at": "2025-12-17T10:00:00Z"
}
```

### GET /api/scan/{id}

Poll scan results by ID.

**Response:**
```json
{
  "scan_id": "scan_abc123",
  "domain": "example.com",
  "status": "completed",
  "score": 85,
  "timestamp": "2025-12-17T10:00:15Z",
  "checks": {
    "mx": {...},
    "spf": {...},
    "dkim": {...},
    "dmarc": {...},
    "smtp": {...}
  },
  "issues": [...],
  "recommendations": [...]
}
```

### POST /api/widget/scan (CORS-enabled)

Public endpoint for embeddable widgets (DNS-only checks by default).

---

## Project Structure

```
yeevu_inbox/
├── api/                   # API route definitions
├── docs/                  # Documentation
│   ├── checks/           # Per-check guides (mx, spf, dkim, dmarc, smtp)
│   ├── scoring.md        # Scoring formula & weights
│   ├── api.md            # API reference
│   └── architecture.md   # System design
├── lib/
│   ├── checks/           # Check implementations (mx.ts, spf.ts, etc.)
│   ├── scanner/
│   │   ├── index.ts      # Main scanner orchestrator
│   │   ├── fetcher.ts    # DNS/SMTP probing utilities
│   │   └── scorer.ts     # Scoring logic
│   ├── types/            # TypeScript definitions
│   └── utils/            # Shared utilities
├── test/                 # Unit & integration tests
├── app/                  # Next.js app (UI pages)
├── components/           # React components
├── public/               # Static assets
├── package.json
├── tsconfig.json
├── wrangler.toml         # Cloudflare Workers config
└── README.md
```

---

## Key Checks

### MX (Mail Exchange)
- Presence and validity of MX records
- Resolution to valid A/AAAA addresses
- Redundancy and priority ordering
- Detects misconfigured CNAMEs

### SPF (Sender Policy Framework)
- Record presence and syntax validation
- DNS lookup count (must be ≤10 per RFC)
- Qualification policy (-all, ~all, ?all)
- Includes and redirect detection

### DKIM (DomainKeys Identified Mail)
- Public key discovery in DNS
- Key strength validation (1024/2048-bit minimum)
- Selector enumeration (configurable)
- Guidance for test-signed message verification

### DMARC (Domain-based Message Authentication, Reporting and Conformance)
- Policy presence and syntax
- Alignment mode configuration (strict/relaxed)
- Reporting addresses (rua/ruf)
- Policy recommendations (none → quarantine → reject path)

### SMTP
- TCP connectivity on port 25/587/465
- Banner and EHLO capability inspection
- STARTTLS negotiation and TLS certificate validation
- Servername (SNI) matching validation
- No intrusive probes (VRFY/RCPT) by default

---

## Scoring Formula

Total **100 points** distributed:

- **MX Records: 20 points** – Presence, redundancy, resolution
- **SPF: 20 points** – Presence, policy strength, lookup efficiency
- **DKIM: 20 points** – Key discovery, key strength
- **DMARC: 25 points** – Policy presence, alignment, reporting
- **SMTP: 15 points** – Connectivity, STARTTLS, certificate validity

Penalties apply for missing records, weak policies, excessive lookups, and TLS issues.
Bonuses for strict policies (`p=reject`) and redundant MX records.

See [docs/scoring.md](docs/scoring.md) for detailed formula and examples.

---

## Configuration

Set environment variables in `.env.local`:

```env
# Scanner defaults
SCANNER_SMTP_TIMEOUT=10000
SCANNER_DNS_TIMEOUT=5000
SCANNER_DKIM_SELECTORS=default,mail,selector1

# Rate limiting
RATE_LIMIT_PER_MINUTE=10
RATE_LIMIT_PER_HOUR=100

# Domain verification (optional)
REQUIRE_DOMAIN_VERIFICATION=true

# Logging
LOG_LEVEL=info
```

---

## Safety & Privacy

- **Domain Verification Required** – Before advanced checks, verify domain ownership via DNS TXT or file upload
- **DNS-Only by Default** – No outbound mail or mailbox probes without explicit consent
- **No Data Retention** – Reports deleted after 30 days (configurable)
- **Audit Logs** – All scan requests logged for compliance
- **Rate Limited** – Per-user and per-API-key rate limits prevent abuse

---

## Development

### Adding a New Check

1. Create `lib/checks/newcheck.ts`:
```typescript
import { CheckRunner } from '../types';

export const checkNewCheck: CheckRunner = async (domain, options) => {
  return {
    status: 'pass' | 'warn' | 'fail',
    details: {...},
    raw: {...},
    recommendations: [...]
  };
};
```

2. Import and register in `lib/scanner/index.ts`
3. Add tests in `test/checks/newcheck.test.ts`
4. Document in `docs/checks/newcheck.md`

---

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- checks/mx.test.ts

# Watch mode
npm test -- --watch
```

---

## Deployment

### Cloudflare Workers (Production)

```bash
npm run build
npx wrangler deploy
```

### Local / Docker

```bash
npm run build
npm run start
```

---

## Roadmap

- [ ] Bounce handling and diagnostics
- [ ] Catch-all detection heuristics
- [ ] IP reputation lookup (Spamhaus, etc.)
- [ ] Email marketing provider detection
- [ ] Scheduled recurring scans
- [ ] Webhooks and API integrations
- [ ] PDF/email report delivery
- [ ] Multi-user dashboard and org management
- [ ] BIMI (Brand Indicators for Message Identification)
- [ ] Custom check plugins

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) (coming soon).

---

## License

MIT

---

## Support

For issues, feature requests, or security concerns:
- **GitHub Issues**: [yeevu/yeevu-inbox/issues](https://github.com/yeevu/yeevu-inbox/issues)
- **Email**: support@yeevu.app
- **Docs**: [docs.yeevu-inbox.app](https://docs.yeevu-inbox.app)

---

**Built by [Yeevu](https://yeevuapp.com)** | Improving email deliverability for all domains

