/**
 * In-memory DbAdapter — local development and testing only.
 * Swap for D1Adapter in production.
 */
import type { DbAdapter, AccountRow, DomainRow, SnapshotRow } from './index.js'

export class MemoryAdapter implements DbAdapter {
  private accounts = new Map<string, AccountRow>()
  private apiKeys = new Map<string, { keyHash: string; accountId: string }>()
  private domains = new Map<string, DomainRow>()
  private snapshots = new Map<string, SnapshotRow>()

  // Seed helpers for local dev
  seedAccount(account: AccountRow, keyHash: string) {
    this.accounts.set(account.id, account)
    this.apiKeys.set(keyHash, { keyHash, accountId: account.id })
  }

  async getAccountByKeyHash(keyHash: string): Promise<AccountRow | null> {
    const key = this.apiKeys.get(keyHash)
    if (!key) return null
    return this.accounts.get(key.accountId) ?? null
  }

  async getDomainsByAccount(accountId: string): Promise<DomainRow[]> {
    return [...this.domains.values()].filter(d => d.account_id === accountId)
  }

  async getDomainByName(name: string): Promise<DomainRow | null> {
    return [...this.domains.values()].find(d => d.name === name) ?? null
  }

  async insertDomain(domain: Omit<DomainRow, 'onboarded_at'>): Promise<void> {
    this.domains.set(domain.name, { ...domain, onboarded_at: new Date().toISOString() })
  }

  async insertSnapshot(row: SnapshotRow): Promise<void> {
    this.snapshots.set(row.id, row)
  }

  async listSnapshots(domainName: string): Promise<Omit<SnapshotRow, 'records'>[]> {
    return [...this.snapshots.values()]
      .filter(s => s.domain_name === domainName)
      .sort((a, b) => b.version - a.version)
      .map(({ records: _, ...rest }) => rest)
  }

  async getSnapshot(id: string): Promise<SnapshotRow | null> {
    return this.snapshots.get(id) ?? null
  }

  async getMaxSnapshotVersion(domainName: string): Promise<number> {
    const versions = [...this.snapshots.values()]
      .filter(s => s.domain_name === domainName)
      .map(s => s.version)
    return versions.length === 0 ? -1 : Math.max(...versions)
  }
}
