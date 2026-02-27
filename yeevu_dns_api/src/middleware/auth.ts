import { createMiddleware } from 'hono/factory'
import { D1Adapter } from '../services/db/d1.js'
import type { DomainRow } from '../services/db/index.js'
import type { HonoEnv } from '../types/env.js'

export interface AuthUser {
  accountId: string
  email: string
  domains: DomainRow[]
}

async function hashApiKey(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }

  const rawKey = authHeader.slice(7)
  const keyHash = await hashApiKey(rawKey)
  const db = new D1Adapter(c.env.DB)

  const account = await db.getAccountByKeyHash(keyHash)

  if (!account) {
    return c.json({ success: false, error: 'Invalid API key' }, 401)
  }

  const domains = await db.getDomainsByAccount(account.id)

  c.set('user', { accountId: account.id, email: account.email, domains })

  await next()
})
