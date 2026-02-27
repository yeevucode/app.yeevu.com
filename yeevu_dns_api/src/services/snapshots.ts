import type { DnsSnapshot, SnapshotMeta, SnapshotTrigger, RestoreResult } from '../types/index.js'
import type { DbAdapter } from './db/index.js'
import { rowToSnapshotMeta, rowToSnapshot } from './db/index.js'
import { CloudflareClient } from './cloudflare.js'

export async function takeSnapshot(
  db: DbAdapter,
  cf: CloudflareClient,
  zoneId: string,
  domain: string,
  trigger: SnapshotTrigger,
  integrationId?: string
): Promise<DnsSnapshot> {
  const records = await cf.listRecords(zoneId)
  const maxVersion = await db.getMaxSnapshotVersion(domain)
  const version = maxVersion + 1

  const label = trigger === 'onboarding'
    ? 'Original'
    : trigger === 'manual'
    ? `Manual — v${version}`
    : `Before ${integrationId}`

  const snapshot = {
    id: crypto.randomUUID(),
    domain_name: domain,
    version,
    label,
    trigger,
    integration_id: integrationId ?? null,
    created_at: new Date().toISOString(),
    record_count: records.length,
    records: JSON.stringify(records),
  }

  await db.insertSnapshot(snapshot)

  return rowToSnapshot(snapshot)
}

export async function listSnapshots(db: DbAdapter, domain: string): Promise<SnapshotMeta[]> {
  const rows = await db.listSnapshots(domain)
  return rows.map(rowToSnapshotMeta)
}

export async function getSnapshot(db: DbAdapter, id: string): Promise<DnsSnapshot | null> {
  const row = await db.getSnapshot(id)
  return row ? rowToSnapshot(row) : null
}

export async function restoreSnapshot(
  db: DbAdapter,
  cf: CloudflareClient,
  zoneId: string,
  domain: string,
  snapshotId: string
): Promise<RestoreResult> {
  const snapshot = await getSnapshot(db, snapshotId)

  if (!snapshot) {
    throw new SnapshotNotFoundError(snapshotId)
  }

  // Safety snapshot of current state before restoring
  await takeSnapshot(db, cf, zoneId, domain, 'manual')

  // Delete all current records
  const current = await cf.listRecords(zoneId)
  for (const record of current) {
    await cf.deleteRecord(zoneId, record.id)
  }

  // Recreate from snapshot
  for (const record of snapshot.records) {
    await cf.createRecord(zoneId, record.type, {
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      priority: record.priority,
      proxied: record.proxied,
      comment: record.comment,
    })
  }

  return {
    snapshotId,
    domain,
    deleted: current.length,
    created: snapshot.records.length,
    success: true,
  }
}

export class SnapshotNotFoundError extends Error {
  constructor(id: string) {
    super(`Snapshot "${id}" not found`)
    this.name = 'SnapshotNotFoundError'
  }
}
