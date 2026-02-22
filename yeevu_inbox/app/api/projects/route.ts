import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import { getStorage, ProjectScanResult, ScanHistoryEntry } from '../../../lib/storage';
import { isValidDomain } from '../../../lib/utils/validate';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDB, insertProjectSave } from '../../../lib/utils/analytics';
import { generateScanId } from '../../../lib/utils/id';
import { getUserTier, TIER_LIMITS, UserTier } from '../../../lib/utils/tier';

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
    const current = userProjects.projects.length;

    // Look up tier from D1 (gracefully falls back to 'free' in local dev)
    let tier: UserTier = 'free';
    try {
      const { env } = await getCloudflareContext();
      const db = getDB(env as Record<string, unknown>);
      if (db) {
        tier = await getUserTier(db as Parameters<typeof getUserTier>[0], userId);
      }
    } catch { /* local dev */ }

    const limit = TIER_LIMITS[tier];
    const canAdd = limit === null || current < limit;

    return NextResponse.json({
      projects: userProjects.projects,
      limits: { current, limit, canAdd, tier },
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

    // Enforce tier-based project limit
    const storage = await getStorage();
    const userProjects = await storage.getUserProjects(userId);
    const current = userProjects.projects.length;

    let tier: UserTier = 'free';
    try {
      const { env } = await getCloudflareContext();
      const dbForTier = getDB(env as Record<string, unknown>);
      if (dbForTier) {
        tier = await getUserTier(dbForTier as Parameters<typeof getUserTier>[0], userId);
      }
    } catch { /* local dev */ }

    const limit = TIER_LIMITS[tier];
    if (limit !== null && current >= limit) {
      return NextResponse.json(
        {
          error: tier === 'free'
            ? `Free accounts can save ${limit} domain. Upgrade to Premium or Unlimited to save more.`
            : `Premium accounts can save up to ${limit} domains. Upgrade to Unlimited for no limit.`,
          upgradeRequired: true,
          tier,
          limit,
        },
        { status: 403 }
      );
    }

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
      const analyticsDb = getDB(env as Record<string, unknown>);
      if (analyticsDb) {
        ctx.waitUntil(insertProjectSave(analyticsDb, {
          id: generateScanId('save'),
          ts: Date.now(),
          user_id: userId,
          user_email: session.user.email ?? null,
          domain,
        }).catch(() => {}));
      }
    } catch { /* local dev */ }

    const newCurrent = current + 1;
    const canAdd = limit === null || newCurrent < limit;

    return NextResponse.json({
      success: true,
      project: result.project,
      limits: { current: newCurrent, limit, canAdd, tier },
    });
  } catch (error) {
    console.error('Projects POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save project' },
      { status: 500 }
    );
  }
}
