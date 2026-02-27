import { proxyDns } from '@/lib/proxy'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ domain: string }> }) {
  const { domain } = await ctx.params
  return proxyDns(`/snapshots/${domain}`)
}

export async function POST(_req: Request, ctx: { params: Promise<{ domain: string }> }) {
  const { domain } = await ctx.params
  return proxyDns(`/snapshots/${domain}`, { method: 'POST' })
}
