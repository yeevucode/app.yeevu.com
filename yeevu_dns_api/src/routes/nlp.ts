import { Hono } from 'hono'
import Anthropic from '@anthropic-ai/sdk'
import { authMiddleware } from '../middleware/auth.js'
import { listIntegrations, getIntegration } from '../integrations/index.js'
import { resolveDomain, DomainNotFoundError } from '../services/resolver.js'
import { CloudflareClient } from '../services/cloudflare.js'
import { takeSnapshot } from '../services/snapshots.js'
import { D1Adapter } from '../services/db/d1.js'
import type { HonoEnv } from '../types/env.js'
import type { NlpRequest, IntegrationStep, StepResult } from '../types/index.js'

const nlp = new Hono<HonoEnv>()

nlp.use('*', authMiddleware)

// Integration IDs use slashes and hyphens (e.g. "setup/email/google-workspace").
// Claude tool names must match ^[a-zA-Z0-9_-]+$ so we encode "/" as "__".
function toToolName(id: string): string {
  return id.replace(/\//g, '__')
}

function fromToolName(name: string): string {
  return name.replace(/__/g, '/')
}

// POST /nlp — route plain English to an integration and execute it
nlp.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<NlpRequest>()

  if (!body.input?.trim()) {
    return c.json({ success: false, error: 'input is required' }, 400)
  }

  const domainName = body.domain ?? user.domains[0]?.name

  if (!domainName) {
    return c.json({ success: false, error: 'No domain found on this account' }, 400)
  }

  try {
    const domain = resolveDomain(user, domainName)

    // Build one Claude tool per integration in the catalog
    const catalog = listIntegrations()
    const tools: Anthropic.Tool[] = catalog.map((integration) => {
      const properties: Record<string, { type: string; description: string }> = {}
      const required: string[] = []

      for (const param of integration.params) {
        if (param.name === 'domain') continue
        properties[param.name] = { type: 'string', description: param.description ?? '' }
        if (param.required) required.push(param.name)
      }

      return {
        name: toToolName(integration.id),
        description: `${integration.name}: ${integration.description}`,
        input_schema: {
          type: 'object' as const,
          properties,
          ...(required.length > 0 ? { required } : {}),
        },
      }
    })

    // Fallback tool — Claude uses this when nothing matches or clarification is needed
    tools.push({
      name: 'no_match',
      description:
        'Use this when the request does not match any available integration, or when more information is needed to proceed.',
      input_schema: {
        type: 'object' as const,
        properties: {
          message: {
            type: 'string',
            description: 'A helpful response explaining what clarification is needed or listing available options.',
          },
        },
        required: ['message'],
      },
    })

    const anthropic = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      tools,
      tool_choice: { type: 'any' }, // force tool use — no free-text fallback
      messages: [
        {
          role: 'user',
          content: `You are a DNS configuration assistant for YeevuDNS. The user wants to configure DNS for their domain.

Domain: ${domainName}
Request: "${body.input}"

Select the best matching integration and extract any required parameters from the request. If the request is unclear or doesn't match any integration, use the no_match tool.`,
        },
      ],
    })

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

    if (!toolUse) {
      return c.json({ success: false, error: 'Unable to understand request' }, 422)
    }

    // Clarification needed
    if (toolUse.name === 'no_match') {
      const input = toolUse.input as { message: string }
      return c.json({ success: true, data: { clarification: input.message } })
    }

    // Map tool name back to integration ID and load it
    const integrationId = fromToolName(toolUse.name)
    const integration = getIntegration(integrationId)

    if (!integration) {
      return c.json({ success: false, error: `Resolved integration "${integrationId}" not found` }, 422)
    }

    // Params extracted by Claude, plus the domain
    const params = { ...(toolUse.input as Record<string, string>), domain: domainName }

    // Auto-snapshot before every run — same as the direct integration route
    const db = new D1Adapter(c.env.DB)
    const cf = new CloudflareClient(c.env.CLOUDFLARE_API_TOKEN)

    await takeSnapshot(db, cf, domain.zone_id, domainName, 'pre-integration', integrationId)

    const stepResults = await executeIntegration(cf, domain.zone_id, integration.steps, params)

    return c.json({
      success: true,
      data: {
        integrationId,
        integrationName: integration.name,
        domain: domainName,
        steps: stepResults,
        success: stepResults.every((s) => s.status !== 'error'),
      },
    })
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return c.json({ success: false, error: err.message }, 404)
    }
    console.error('[nlp]', err)
    return c.json({ success: false, error: 'Unable to process request' }, 500)
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
        const toDelete = existing.filter((r) => {
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

export default nlp
