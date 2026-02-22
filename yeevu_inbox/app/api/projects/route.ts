import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import { getStorage, ProjectScanResult } from '../../../lib/storage';
import { isValidDomain } from '../../../lib/utils/validate';

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

    const body = await request.json() as { domain?: string; scanResult?: ProjectScanResult };

    const { domain, scanResult } = body;

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
    const result = await storage.addProject(userId, domain, scanResult);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

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
