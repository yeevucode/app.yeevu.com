import { proxyDns } from '@/lib/proxy'
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  return proxyDns('/nlp', { method: 'POST', body: await req.text() })
}
