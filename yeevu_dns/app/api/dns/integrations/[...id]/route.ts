import { proxyDns } from '@/lib/proxy'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string[] }> }) {
  const { id } = await ctx.params
  return proxyDns(`/integrations/${id.join('/')}`)
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string[] }> }) {
  const { id } = await ctx.params
  const segments = id.join('/')
  // strip trailing /run if present (Next.js catch-all includes it)
  const integrationId = segments.endsWith('/run') ? segments.slice(0, -4) : segments
  return proxyDns(`/integrations/${integrationId}/run`, { method: 'POST', body: await req.text() })
}
