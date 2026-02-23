import { handleAuth } from '@auth0/nextjs-auth0';

// Next.js 15: ctx.params is a Promise — must be awaited before passing to
// @auth0/nextjs-auth0, which still accesses params.auth0 synchronously.
const auth0Handler = handleAuth();
export const dynamic = 'force-dynamic';

function disableCache(res: Response) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  res.headers.set('Surrogate-Control', 'no-store');
  return res;
}

export async function GET(req: Request, ctx: { params: Promise<{ auth0: string[] }> }) {
  const params = await ctx.params;
  const res = await auth0Handler(req, { params });
  return disableCache(res);
}

export async function POST(req: Request, ctx: { params: Promise<{ auth0: string[] }> }) {
  const params = await ctx.params;
  const res = await auth0Handler(req, { params });
  return disableCache(res);
}
