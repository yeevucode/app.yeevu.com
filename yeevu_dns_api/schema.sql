-- YeevuDNS — D1 Schema
-- Run via: wrangler d1 execute yeevu-dns --file=schema.sql

-- User accounts
CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  auth0_sub   TEXT UNIQUE,             -- Auth0 subject ID, set on UI signup
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Hashed API keys for Bearer token auth
-- One account can have multiple keys (e.g. production, N8N, internal)
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key_hash    TEXT UNIQUE NOT NULL,  -- SHA-256 of raw key — raw key never stored
  label       TEXT,                  -- e.g. "Production", "N8N"
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Customer domains managed by YeevuDNS
CREATE TABLE IF NOT EXISTS domains (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name         TEXT UNIQUE NOT NULL,  -- e.g. example.com
  zone_id      TEXT NOT NULL,         -- Cloudflare Zone ID — never exposed via API
  onboarded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- DNS snapshots for versioning and restore
-- records stored as JSON blob — queried wholesale, never filtered per-record
CREATE TABLE IF NOT EXISTS snapshots (
  id             TEXT PRIMARY KEY,
  domain_name    TEXT NOT NULL,
  version        INTEGER NOT NULL,
  label          TEXT NOT NULL,
  trigger        TEXT NOT NULL,        -- 'onboarding' | 'pre-integration' | 'manual'
  integration_id TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  record_count   INTEGER NOT NULL,
  records        TEXT NOT NULL         -- JSON: DnsRecord[]
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_hash     ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_accounts_auth0    ON accounts(auth0_sub);
CREATE INDEX IF NOT EXISTS idx_domains_account   ON domains(account_id);
CREATE INDEX IF NOT EXISTS idx_domains_name      ON domains(name);
CREATE INDEX IF NOT EXISTS idx_snapshots_domain  ON snapshots(domain_name, version DESC);
