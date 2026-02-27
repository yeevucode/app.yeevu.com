// Server-side helper: proxy a request to the YeevuDNS Hono API using the user's API key.
// Used only in Next.js API routes (server-side).

export async function dnsApi(
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const baseUrl = process.env.YEEVU_DNS_API_URL || 'https://yeevu-dns.domains-12a.workers.dev'
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers ?? {}),
    },
  })
}
