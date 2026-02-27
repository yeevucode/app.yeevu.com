import type { DbAdapter, AccountRow, DomainRow, SnapshotRow } from './index.js'

export class D1Adapter implements DbAdapter {
  constructor(private db: D1Database) {}

  async getAccountByKeyHash(keyHash: string): Promise<AccountRow | null> {
    const result = await this.db
      .prepare(`
        SELECT a.id, a.email, a.created_at
        FROM api_keys k
        JOIN accounts a ON a.id = k.account_id
        WHERE k.key_hash = ?
        LIMIT 1
      `)
      .bind(keyHash)
      .first<AccountRow>()
    return result ?? null
  }

  async getAccountByAuth0Sub(sub: string): Promise<AccountRow | null> {
    const result = await this.db
      .prepare('SELECT * FROM accounts WHERE auth0_sub = ? LIMIT 1')
      .bind(sub)
      .first<AccountRow>()
    return result ?? null
  }

  async insertAccount(account: { id: string; email: string; auth0_sub: string }): Promise<void> {
    await this.db
      .prepare('INSERT INTO accounts (id, email, auth0_sub) VALUES (?, ?, ?)')
      .bind(account.id, account.email, account.auth0_sub)
      .run()
  }

  async insertApiKey(key: { id: string; account_id: string; key_hash: string; label: string }): Promise<void> {
    await this.db
      .prepare('INSERT INTO api_keys (id, account_id, key_hash, label) VALUES (?, ?, ?, ?)')
      .bind(key.id, key.account_id, key.key_hash, key.label)
      .run()
  }

  async getDomainsByAccount(accountId: string): Promise<DomainRow[]> {
    const result = await this.db
      .prepare('SELECT * FROM domains WHERE account_id = ? ORDER BY onboarded_at ASC')
      .bind(accountId)
      .all<DomainRow>()
    return result.results
  }

  async getDomainByName(name: string): Promise<DomainRow | null> {
    const result = await this.db
      .prepare('SELECT * FROM domains WHERE name = ? LIMIT 1')
      .bind(name)
      .first<DomainRow>()
    return result ?? null
  }

  async insertDomain(domain: Omit<DomainRow, 'onboarded_at'>): Promise<void> {
    await this.db
      .prepare('INSERT INTO domains (id, account_id, name, zone_id) VALUES (?, ?, ?, ?)')
      .bind(domain.id, domain.account_id, domain.name, domain.zone_id)
      .run()
  }

  async insertSnapshot(row: SnapshotRow): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO snapshots (id, domain_name, version, label, trigger, integration_id, created_at, record_count, records)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        row.id,
        row.domain_name,
        row.version,
        row.label,
        row.trigger,
        row.integration_id ?? null,
        row.created_at,
        row.record_count,
        row.records,
      )
      .run()
  }

  async listSnapshots(domainName: string): Promise<Omit<SnapshotRow, 'records'>[]> {
    const result = await this.db
      .prepare(`
        SELECT id, domain_name, version, label, trigger, integration_id, created_at, record_count
        FROM snapshots WHERE domain_name = ? ORDER BY version DESC
      `)
      .bind(domainName)
      .all<Omit<SnapshotRow, 'records'>>()
    return result.results
  }

  async getSnapshot(id: string): Promise<SnapshotRow | null> {
    const result = await this.db
      .prepare('SELECT * FROM snapshots WHERE id = ? LIMIT 1')
      .bind(id)
      .first<SnapshotRow>()
    return result ?? null
  }

  async getMaxSnapshotVersion(domainName: string): Promise<number> {
    const result = await this.db
      .prepare('SELECT MAX(version) as max_version FROM snapshots WHERE domain_name = ?')
      .bind(domainName)
      .first<{ max_version: number | null }>()
    return result?.max_version ?? -1
  }
}
