// Server-side helper: get the user's API key and proxy a DNS API call.
// All /api/dns/* route handlers use this.

import { getSession } from '@auth0/nextjs-auth0'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getOrCreateApiKey } from './account'
import { dnsApi } from './dns-client'
import type { KVNamespace } from '@cloudflare/workers-types'

export async function proxyDns(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { env } = await getCloudflareContext()
  const kv = (env as unknown as { DNS_KEYS_KV: KVNamespace }).DNS_KEYS_KV

  let apiKey: string
  try {
    apiKey = await getOrCreateApiKey(kv, session.user.sub, session.user.email ?? '')
  } catch {
    return Response.json({ error: 'Failed to resolve account' }, { status: 500 })
  }

  const upstream = await dnsApi(apiKey, path, options)
  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
