import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDB, updateScanEvent } from '../../../../lib/utils/analytics';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      eventId?: string;
      configScore?: number;
      finalScore?: number;
      reputationTier?: string;
      checkStatuses?: {
        mx?: string;
        spf?: string;
        dkim?: string;
        dmarc?: string;
        smtp?: string;
      };
    };

    const { eventId, configScore, finalScore, reputationTier, checkStatuses } = body;

    if (!eventId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    try {
      const { env } = await getCloudflareContext();
      const db = getDB(env as Record<string, unknown>);
      if (db) {
        await updateScanEvent(db, {
          id: eventId,
          config_score: configScore ?? 0,
          final_score: finalScore ?? 0,
          reputation_tier: reputationTier ?? 'unknown',
          mx_status: checkStatuses?.mx ?? 'fail',
          spf_status: checkStatuses?.spf ?? 'fail',
          dkim_status: checkStatuses?.dkim ?? 'fail',
          dmarc_status: checkStatuses?.dmarc ?? 'fail',
          smtp_status: checkStatuses?.smtp ?? 'fail',
        });
      }
    } catch { /* local dev — no DB binding */ }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
