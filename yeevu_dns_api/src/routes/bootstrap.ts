import { Hono } from 'hono'
import { D1Adapter } from '../services/db/d1.js'
import type { HonoEnv } from '../types/env.js'

const bootstrap = new Hono<HonoEnv>()

/**
 * POST /accounts/bootstrap
 *
 * Called by the YeevuDNS UI on first login to provision a user account.
 * Protected by X-Bootstrap-Secret header — never called by end users directly.
 *
 * Idempotent: if account already exists for the auth0Sub, generates a fresh API key
 * and returns it (the UI stores it in KV; this is only called when KV misses).
 *
 * Returns: { accountId, apiKey } — apiKey is the raw token (never stored, only hashed)
 */
bootstrap.post('/', async (c) => {
  const secret = c.req.header('x-bootstrap-secret')

  if (!secret || secret !== c.env.BOOTSTRAP_SECRET) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }

  const { email, auth0Sub } = await c.req.json<{ email: string; auth0Sub: string }>()

  if (!email || !auth0Sub) {
    return c.json({ success: false, error: 'email and auth0Sub are required' }, 400)
  }

  const db = new D1Adapter(c.env.DB)

  // Find or create account
  let account = await db.getAccountByAuth0Sub(auth0Sub)

  if (!account) {
    const accountId = crypto.randomUUID()
    await db.insertAccount({ id: accountId, email, auth0_sub: auth0Sub })
    account = await db.getAccountByAuth0Sub(auth0Sub)
  }

  if (!account) {
    return c.json({ success: false, error: 'Failed to create account' }, 500)
  }

  // Always issue a fresh API key (raw key only returned here, then hashed + stored)
  const rawKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const keyBytes = new TextEncoder().encode(rawKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes)
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  await db.insertApiKey({
    id: crypto.randomUUID(),
    account_id: account.id,
    key_hash: keyHash,
    label: 'UI',
  })

  return c.json({
    success: true,
    data: { accountId: account.id, apiKey: rawKey },
  })
})

export default bootstrap
