import { handleAuth } from '@auth0/nextjs-auth0'

const auth0Handler = handleAuth()
export const dynamic = 'force-dynamic'

function noCache(res: Response) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.headers.set('Pragma', 'no-cache')
  return res
}

// Next.js 15: ctx.params is a Promise — must be awaited before passing to handleAuth
export async function GET(req: Request, ctx: { params: Promise<{ auth0: string[] }> }) {
  const params = await ctx.params
  const res = await auth0Handler(req, { params })
  return noCache(res)
}

export async function POST(req: Request, ctx: { params: Promise<{ auth0: string[] }> }) {
  const params = await ctx.params
  const res = await auth0Handler(req, { params })
  return noCache(res)
}
