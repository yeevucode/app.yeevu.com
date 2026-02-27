import type { DnsSnapshot, SnapshotMeta, SnapshotTrigger, DnsRecord } from '../../types/index.js'

// --- Row types (what comes back from D1) ---

export interface AccountRow {
  id: string
  email: string
  auth0_sub: string | null
  created_at: string
}

export interface DomainRow {
  id: string
  account_id: string
  name: string
  zone_id: string
  onboarded_at: string
}

export interface SnapshotRow {
  id: string
  domain_name: string
  version: number
  label: string
  trigger: SnapshotTrigger
  integration_id: string | null
  created_at: string
  record_count: number
  records: string  // JSON
}

// --- DbAdapter interface ---
// Implement this for D1 (production) or in-memory (dev/test)

export interface DbAdapter {
  // Auth
  getAccountByKeyHash(keyHash: string): Promise<AccountRow | null>
  getAccountByAuth0Sub(sub: string): Promise<AccountRow | null>
  insertAccount(account: { id: string; email: string; auth0_sub: string }): Promise<void>
  insertApiKey(key: { id: string; account_id: string; key_hash: string; label: string }): Promise<void>

  // Domains
  getDomainsByAccount(accountId: string): Promise<DomainRow[]>
  getDomainByName(name: string): Promise<DomainRow | null>
  insertDomain(domain: Omit<DomainRow, 'onboarded_at'>): Promise<void>

  // Snapshots
  insertSnapshot(row: Omit<SnapshotRow, never>): Promise<void>
  listSnapshots(domainName: string): Promise<Omit<SnapshotRow, 'records'>[]>
  getSnapshot(id: string): Promise<SnapshotRow | null>
  getMaxSnapshotVersion(domainName: string): Promise<number>
}

// --- Helpers ---

export function rowToSnapshotMeta(row: Omit<SnapshotRow, 'records'>): SnapshotMeta {
  return {
    id: row.id,
    domain: row.domain_name,
    version: row.version,
    label: row.label,
    trigger: row.trigger,
    integrationId: row.integration_id ?? undefined,
    createdAt: row.created_at,
    recordCount: row.record_count,
  }
}

export function rowToSnapshot(row: SnapshotRow): DnsSnapshot {
  return {
    ...rowToSnapshotMeta(row),
    records: JSON.parse(row.records) as DnsRecord[],
  }
}
