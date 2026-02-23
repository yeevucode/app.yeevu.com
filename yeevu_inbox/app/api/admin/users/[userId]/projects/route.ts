import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import { isAdmin } from '../../../../../../lib/utils/admin';
import { getStorage } from '../../../../../../lib/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const adminIds = process.env.ADMIN_USER_IDS ?? '';
  if (!isAdmin(session.user.sub, adminIds)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const storage = await getStorage();
  const userProjects = await storage.getUserProjects(decodeURIComponent(userId));

  return NextResponse.json({ projects: userProjects.projects });
}
