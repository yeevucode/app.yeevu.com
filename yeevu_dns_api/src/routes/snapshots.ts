import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { takeSnapshot, listSnapshots, getSnapshot, restoreSnapshot, SnapshotNotFoundError } from '../services/snapshots.js'
import { resolveDomain, DomainNotFoundError } from '../services/resolver.js'
import { CloudflareClient } from '../services/cloudflare.js'
import { D1Adapter } from '../services/db/d1.js'
import type { HonoEnv } from '../types/env.js'

const snapshots = new Hono<HonoEnv>()

snapshots.use('*', authMiddleware)

// GET /snapshots/:domain — list all snapshots for a domain
snapshots.get('/:domain', async (c) => {
  const user = c.get('user')
  const domainName = c.req.param('domain')

  try {
    resolveDomain(user, domainName) // access check
    const db = new D1Adapter(c.env.DB)
    const list = await listSnapshots(db, domainName)
    return c.json({ success: true, data: list })
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return c.json({ success: false, error: err.message }, 404)
    }
    throw err
  }
})

// GET /snapshots/:domain/:id — get a single snapshot with full records
snapshots.get('/:domain/:id', async (c) => {
  const user = c.get('user')
  const domainName = c.req.param('domain')
  const snapshotId = c.req.param('id')

  try {
    resolveDomain(user, domainName) // access check
    const db = new D1Adapter(c.env.DB)
    const snapshot = await getSnapshot(db, snapshotId)

    if (!snapshot || snapshot.domain !== domainName) {
      return c.json({ success: false, error: 'Snapshot not found' }, 404)
    }

    return c.json({ success: true, data: snapshot })
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return c.json({ success: false, error: err.message }, 404)
    }
    throw err
  }
})

// POST /snapshots/:domain — take a manual snapshot
snapshots.post('/:domain', async (c) => {
  const user = c.get('user')
  const domainName = c.req.param('domain')

  try {
    const domain = resolveDomain(user, domainName)
    const db = new D1Adapter(c.env.DB)
    const cf = new CloudflareClient(c.env.CLOUDFLARE_API_TOKEN)
    const snapshot = await takeSnapshot(db, cf, domain.zone_id, domainName, 'manual')
    return c.json({ success: true, data: { id: snapshot.id, version: snapshot.version, label: snapshot.label } }, 201)
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return c.json({ success: false, error: err.message }, 404)
    }
    throw err
  }
})

// POST /snapshots/:domain/:id/restore — restore a snapshot
snapshots.post('/:domain/:id/restore', async (c) => {
  const user = c.get('user')
  const domainName = c.req.param('domain')
  const snapshotId = c.req.param('id')

  try {
    const domain = resolveDomain(user, domainName)
    const db = new D1Adapter(c.env.DB)
    const cf = new CloudflareClient(c.env.CLOUDFLARE_API_TOKEN)
    const result = await restoreSnapshot(db, cf, domain.zone_id, domainName, snapshotId)
    return c.json({ success: true, data: result })
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return c.json({ success: false, error: err.message }, 404)
    }
    if (err instanceof SnapshotNotFoundError) {
      return c.json({ success: false, error: err.message }, 404)
    }
    throw err
  }
})

export default snapshots
