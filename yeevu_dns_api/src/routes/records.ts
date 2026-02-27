import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { CloudflareClient } from '../services/cloudflare.js'
import { resolveDomain, DomainNotFoundError } from '../services/resolver.js'
import type { HonoEnv } from '../types/env.js'
import type { RecordType, CreateRecordPayload, UpdateRecordPayload } from '../types/index.js'

const records = new Hono<HonoEnv>()

records.use('*', authMiddleware)

const VALID_TYPES: RecordType[] = ['A', 'MX', 'TXT', 'CNAME']

function validateType(type: string): type is RecordType {
  return VALID_TYPES.includes(type as RecordType)
}

// POST /records/:domain/:type — create a DNS record
records.post('/:domain/:type', async (c) => {
  const user = c.get('user')
  const domainName = c.req.param('domain')
  const type = c.req.param('type').toUpperCase()

  if (!validateType(type)) {
    return c.json({ success: false, error: `Invalid record type: ${type}` }, 400)
  }

  try {
    const domain = resolveDomain(user, domainName)
    const cf = new CloudflareClient(c.env.CLOUDFLARE_API_TOKEN)
    const payload = await c.req.json<CreateRecordPayload>()
    const record = await cf.createRecord(domain.zone_id, type, payload)
    return c.json({ success: true, data: record }, 201)
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return c.json({ success: false, error: err.message }, 404)
    }
    throw err
  }
})

// PUT /records/:domain/:type/:id — update a DNS record
records.put('/:domain/:type/:id', async (c) => {
  const user = c.get('user')
  const domainName = c.req.param('domain')
  const type = c.req.param('type').toUpperCase()
  const recordId = c.req.param('id')

  if (!validateType(type)) {
    return c.json({ success: false, error: `Invalid record type: ${type}` }, 400)
  }

  try {
    const domain = resolveDomain(user, domainName)
    const cf = new CloudflareClient(c.env.CLOUDFLARE_API_TOKEN)
    const payload = await c.req.json<UpdateRecordPayload>()
    const record = await cf.updateRecord(domain.zone_id, recordId, payload)
    return c.json({ success: true, data: record })
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return c.json({ success: false, error: err.message }, 404)
    }
    throw err
  }
})

// DELETE /records/:domain/:type/:id — delete a DNS record
records.delete('/:domain/:type/:id', async (c) => {
  const user = c.get('user')
  const domainName = c.req.param('domain')
  const recordId = c.req.param('id')

  try {
    const domain = resolveDomain(user, domainName)
    const cf = new CloudflareClient(c.env.CLOUDFLARE_API_TOKEN)
    await cf.deleteRecord(domain.zone_id, recordId)
    return c.json({ success: true, data: null })
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return c.json({ success: false, error: err.message }, 404)
    }
    throw err
  }
})

export default records
