import { handleAuth } from '@auth0/nextjs-auth0';

// Next.js 15: ctx.params is a Promise — must be awaited before passing to
// @auth0/nextjs-auth0, which still accesses params.auth0 synchronously.
const auth0Handler = handleAuth();

export async function GET(req: Request, ctx: { params: Promise<{ auth0: string[] }> }) {
  const params = await ctx.params;
  return auth0Handler(req, { params });
}

export async function POST(req: Request, ctx: { params: Promise<{ auth0: string[] }> }) {
  const params = await ctx.params;
  return auth0Handler(req, { params });
}
