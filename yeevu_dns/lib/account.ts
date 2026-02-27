// Server-side helper: get or provision the user's YeevuDNS API key.
// On first call for a user, hits POST /accounts/bootstrap on the Hono API
// and stores the result in KV. Subsequent calls return the cached key.

import type { KVNamespace } from '@cloudflare/workers-types'

export async function getOrCreateApiKey(
  kv: KVNamespace,
  auth0Sub: string,
  email: string
): Promise<string> {
  const kvKey = `dns-key:${auth0Sub}`

  // Check cache
  const cached = await kv.get(kvKey)
  if (cached) return cached

  // Provision a new account + API key
  const apiUrl = process.env.YEEVU_DNS_API_URL || 'https://yeevu-dns.domains-12a.workers.dev'
  const bootstrapSecret = process.env.BOOTSTRAP_SECRET

  const res = await fetch(`${apiUrl}/accounts/bootstrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bootstrap-secret': bootstrapSecret ?? '',
    },
    body: JSON.stringify({ email, auth0Sub }),
  })

  if (!res.ok) {
    throw new Error(`Bootstrap failed: ${res.status}`)
  }

  const json = (await res.json()) as { success: boolean; data: { accountId: string; apiKey: string } }

  if (!json.success) {
    throw new Error('Bootstrap returned success: false')
  }

  // Store in KV (no expiry — key is permanent)
  await kv.put(kvKey, json.data.apiKey)
  return json.data.apiKey
}
