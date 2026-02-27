// GET /api/dns/account
// Returns the user's YeevuDNS API key (provisioning if first login).
// Used by API proxy routes — never returns the key to the browser.

import { getSession } from '@auth0/nextjs-auth0'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getOrCreateApiKey } from '@/lib/account'
import type { KVNamespace } from '@cloudflare/workers-types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { env } = await getCloudflareContext()
  const kv = (env as unknown as { DNS_KEYS_KV: KVNamespace }).DNS_KEYS_KV

  try {
    const apiKey = await getOrCreateApiKey(kv, session.user.sub, session.user.email ?? '')
    return Response.json({ apiKey })
  } catch (err) {
    console.error('[dns/account]', err)
    return Response.json({ error: 'Failed to provision account' }, { status: 500 })
  }
}
