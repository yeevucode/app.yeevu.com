import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import { getStorage, ProjectScanResult, ScanHistoryEntry } from '../../../lib/storage';
import { isValidDomain } from '../../../lib/utils/validate';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDB, insertProjectSave } from '../../../lib/utils/analytics';
import { generateScanId } from '../../../lib/utils/id';

// GET /api/projects - List all projects for the user
export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = session.user.sub;
    const storage = await getStorage();
    const userProjects = await storage.getUserProjects(userId);
    const limits = await storage.getProjectLimits(userId);

    return NextResponse.json({
      projects: userProjects.projects,
      limits,
    });
  } catch (error) {
    console.error('Projects GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load projects' },
      { status: 500 }
    );
  }
}

// POST /api/projects - Add a new project
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = session.user.sub;

    const body = await request.json() as { domain?: string; scanResult?: ProjectScanResult; historyEntry?: ScanHistoryEntry };

    const { domain, scanResult, historyEntry } = body;

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400 }
      );
    }

    if (!isValidDomain(domain)) {
      return NextResponse.json(
        { error: 'Invalid domain format' },
        { status: 400 }
      );
    }

    const storage = await getStorage();
    const result = await storage.addProject(userId, domain, scanResult, historyEntry);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // Analytics: log project save
    try {
      const { env, ctx } = await getCloudflareContext();
      const db = getDB(env as Record<string, unknown>);
      if (db) {
        ctx.waitUntil(insertProjectSave(db, {
          id: generateScanId('save'),
          ts: Date.now(),
          user_id: userId,
          user_email: session.user.email ?? null,
          domain,
        }).catch(() => {}));
      }
    } catch { /* local dev */ }

    // Get updated limits
    const limits = await storage.getProjectLimits(userId);

    return NextResponse.json({
      success: true,
      project: result.project,
      limits,
    });
  } catch (error) {
    console.error('Projects POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save project' },
      { status: 500 }
    );
  }
}
