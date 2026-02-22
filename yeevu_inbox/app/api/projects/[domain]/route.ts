import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import { getStorage, ProjectScanResult, ScanHistoryEntry } from '../../../../lib/storage';

// GET /api/projects/[domain] - Get a single project
export async function GET(
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
    const project = await storage.getProject(userId, decodeURIComponent(domain));

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Project GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get project' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[domain] - Remove a project
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
    const result = await storage.removeProject(userId, decodeURIComponent(domain));

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Project DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to remove project' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[domain] - Update scan result for a project
export async function PUT(
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

    const body = await request.json() as { scanResult?: ProjectScanResult; historyEntry?: ScanHistoryEntry };
    const { scanResult, historyEntry } = body;

    if (!scanResult) {
      return NextResponse.json(
        { error: 'Scan result is required' },
        { status: 400 }
      );
    }

    const storage = await getStorage();
    const result = await storage.updateProjectScan(
      userId,
      decodeURIComponent(domain),
      scanResult,
      historyEntry
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Project PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}
