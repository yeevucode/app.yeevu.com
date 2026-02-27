import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { CloudflareClient } from '../services/cloudflare.js'
import { takeSnapshot } from '../services/snapshots.js'
import { D1Adapter } from '../services/db/d1.js'
import type { HonoEnv } from '../types/env.js'

const onboarding = new Hono<HonoEnv>()

onboarding.use('*', authMiddleware)

/**
 * POST /onboarding/verify
 *
 * Called after a user points their nameservers to Yeevu.
 * 1. Confirms the domain exists in our Cloudflare account (NS propagated)
 * 2. Triggers a DNS scan to import existing records into the zone
 * 3. Persists domain → zoneId mapping to D1
 * 4. Saves imported records as Snapshot v0 "Original"
 */
onboarding.post('/verify', async (c) => {
  const user = c.get('user')
  const { domain } = await c.req.json<{ domain: string }>()

  if (!domain) {
    return c.json({ success: false, error: 'domain is required' }, 400)
  }

  const db = new D1Adapter(c.env.DB)
  const cf = new CloudflareClient(c.env.CLOUDFLARE_API_TOKEN)

  // Check if already onboarded
  const existing = await db.getDomainByName(domain)
  if (existing) {
    if (existing.account_id !== user.accountId) {
      return c.json({ success: false, error: 'Domain is already registered to another account' }, 409)
    }
    return c.json({ success: false, error: 'Domain is already onboarded', code: 'ALREADY_ONBOARDED' }, 409)
  }

  // Confirm domain is in our Cloudflare account (NS must be pointed to us)
  const zoneId = await cf.getZoneIdByDomain(domain)

  if (!zoneId) {
    return c.json({
      success: false,
      error: `Domain "${domain}" not found. Please ensure your nameservers are pointed to Yeevu and try again.`,
      code: 'NS_NOT_PROPAGATED',
    }, 422)
  }

  // Scan existing DNS records — imports them into the Cloudflare zone
  await cf.scanRecords(zoneId)

  // Fetch the full imported record set
  const records = await cf.listRecords(zoneId)

  // Persist domain → zoneId to D1
  await db.insertDomain({
    id: crypto.randomUUID(),
    account_id: user.accountId,
    name: domain,
    zone_id: zoneId,
  })

  // Save as Snapshot v0 — the "Original" baseline
  const snapshot = await takeSnapshot(db, cf, zoneId, domain, 'onboarding')

  return c.json({
    success: true,
    data: {
      domain,
      recordsImported: records.length,
      snapshot: {
        id: snapshot.id,
        version: snapshot.version,
        label: snapshot.label,
      },
      message: `${records.length} DNS records imported. Your services will continue to work uninterrupted.`,
    },
  })
})

export default onboarding
