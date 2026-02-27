import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { listIntegrations, getIntegration } from '../integrations/index.js'
import { resolveDomain, DomainNotFoundError } from '../services/resolver.js'
import { CloudflareClient } from '../services/cloudflare.js'
import { takeSnapshot } from '../services/snapshots.js'
import { D1Adapter } from '../services/db/d1.js'
import type { HonoEnv } from '../types/env.js'
import type { RunIntegrationPayload, IntegrationResult, StepResult, IntegrationStep } from '../types/index.js'

const integrations = new Hono<HonoEnv>()

integrations.use('*', authMiddleware)

// GET /integrations — list all available integrations
integrations.get('/', (c) => {
  const all = listIntegrations().map(i => ({
    id: i.id,
    name: i.name,
    description: i.description,
    params: i.params,
  }))
  return c.json({ success: true, data: all })
})

// GET /integrations/:id — get a single integration schema
integrations.get('/:id{.+}', (c) => {
  const id = c.req.param('id')
  const integration = getIntegration(id)

  if (!integration) {
    return c.json({ success: false, error: `Integration "${id}" not found` }, 404)
  }

  return c.json({ success: true, data: integration })
})

// POST /integrations/:id/run — execute an integration
integrations.post('/:id{.+}/run', async (c) => {
  const user = c.get('user')
  const integrationId = c.req.param('id').replace(/\/run$/, '')
  const integration = getIntegration(integrationId)

  if (!integration) {
    return c.json({ success: false, error: `Integration "${integrationId}" not found` }, 404)
  }

  const body = await c.req.json<RunIntegrationPayload>()
  const params = body.params ?? {}

  for (const p of integration.params) {
    if (p.required && p.name !== 'domain' && !params[p.name]) {
      return c.json({ success: false, error: `Missing required param: ${p.name}` }, 400)
    }
  }

  try {
    const domain = resolveDomain(user, body.domain)
    const db = new D1Adapter(c.env.DB)
    const cf = new CloudflareClient(c.env.CLOUDFLARE_API_TOKEN)

    // Auto-snapshot before every integration run — safety net
    await takeSnapshot(db, cf, domain.zone_id, body.domain, 'pre-integration', integrationId)

    const stepResults = await executeIntegration(cf, domain.zone_id, integration.steps, params)

    const result: IntegrationResult = {
      integrationId,
      domain: body.domain,
      steps: stepResults,
      success: stepResults.every(s => s.status !== 'error'),
    }

    return c.json({ success: true, data: result })
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return c.json({ success: false, error: err.message }, 404)
    }
    throw err
  }
})

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] ?? '')
}

async function executeIntegration(
  cf: CloudflareClient,
  zoneId: string,
  steps: IntegrationStep[],
  params: Record<string, string>
): Promise<StepResult[]> {
  const results: StepResult[] = []

  for (const step of steps) {
    const recordName = interpolate(step.name ?? '@', params)

    try {
      if (step.action === 'delete_existing') {
        const existing = await cf.listRecords(zoneId, step.type)
        const toDelete = existing.filter(r => {
          const nameMatch = r.name.replace(/\.$/, '') === recordName || r.name === '@'
          const contentMatch = step.match ? r.content.includes(step.match) : true
          return nameMatch && contentMatch
        })

        for (const record of toDelete) {
          await cf.deleteRecord(zoneId, record.id)
          results.push({ action: 'delete', type: step.type, name: recordName, status: 'success', recordId: record.id })
        }

        if (toDelete.length === 0) {
          results.push({ action: 'delete_existing', type: step.type, name: recordName, status: 'skipped' })
        }
      }

      if (step.action === 'create' && step.content) {
        const content = interpolate(step.content, params)
        const record = await cf.createRecord(zoneId, step.type, {
          name: recordName,
          content,
          priority: step.priority,
          ttl: step.ttl ?? 300,
        })
        results.push({ action: 'create', type: step.type, name: recordName, status: 'success', recordId: record.id })
      }
    } catch (err) {
      results.push({
        action: step.action,
        type: step.type,
        name: recordName,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return results
}

export default integrations
