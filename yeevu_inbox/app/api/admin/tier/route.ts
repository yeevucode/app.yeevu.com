import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { isAdmin } from '../../../../lib/utils/admin';
import { getDB } from '../../../../lib/utils/analytics';
import { setUserTier, UserTier } from '../../../../lib/utils/tier';

const VALID_TIERS: UserTier[] = ['free', 'growth', 'scale', 'enterprise'];

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const adminIds = process.env.ADMIN_USER_IDS ?? '';
  if (!isAdmin(session.user.sub, adminIds)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let db: Parameters<typeof setUserTier>[0] | null = null;
  try {
    const { env } = await getCloudflareContext();
    db = getDB(env as Record<string, unknown>) as Parameters<typeof setUserTier>[0] | null;
  } catch {
    return NextResponse.json({ error: 'DB not available in local dev' }, { status: 503 });
  }

  if (!db) {
    return NextResponse.json({ error: 'DB binding not found' }, { status: 503 });
  }

  const body = await request.json() as { user_id?: string; user_email?: string; tier?: string };
  const { user_id, user_email, tier } = body;

  if (!user_id || !tier) {
    return NextResponse.json({ error: 'user_id and tier are required' }, { status: 400 });
  }

  if (!VALID_TIERS.includes(tier as UserTier)) {
    return NextResponse.json({ error: `tier must be one of: ${VALID_TIERS.join(', ')}` }, { status: 400 });
  }

  await setUserTier(db, user_id, user_email ?? null, tier as UserTier);

  return NextResponse.json({ success: true, user_id, tier });
}
