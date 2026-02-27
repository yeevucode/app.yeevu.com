import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { CloudflareClient } from '../services/cloudflare.js'
import { resolveDomain, DomainNotFoundError } from '../services/resolver.js'
import type { HonoEnv } from '../types/env.js'

const domains = new Hono<HonoEnv>()

domains.use('*', authMiddleware)

// GET /domains — list all domains on the account
domains.get('/', (c) => {
  const user = c.get('user')
  return c.json({
    success: true,
    data: user.domains.map(d => ({ id: d.id, name: d.name })), // zone_id excluded
  })
})

// GET /domains/:domain/records — list all DNS records for a domain
domains.get('/:domain/records', async (c) => {
  const user = c.get('user')
  const domainName = c.req.param('domain')

  try {
    const domain = resolveDomain(user, domainName)
    const cf = new CloudflareClient(c.env.CLOUDFLARE_API_TOKEN)
    const records = await cf.listRecords(domain.zone_id)
    return c.json({ success: true, data: records })
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return c.json({ success: false, error: err.message }, 404)
    }
    throw err
  }
})

export default domains
