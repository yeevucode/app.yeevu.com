import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import { getStorage } from '../../../../../lib/storage';

// DELETE /api/projects/[domain]/history - Clear scan history for a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { domain } = await params;
    const userId = session.user.sub;
    const storage = await getStorage();
    const result = await storage.clearHistory(userId, decodeURIComponent(domain));

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('History DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to clear history' },
      { status: 500 }
    );
  }
}
