import { proxyDns } from '@/lib/proxy'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return proxyDns(`/snapshots/${id}/restore`, { method: 'POST', body: await req.text() })
}
