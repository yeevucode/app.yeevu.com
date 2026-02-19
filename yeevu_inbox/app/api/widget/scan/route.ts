import { NextRequest, NextResponse } from 'next/server';
import { checkSpf } from '../../../../lib/checks/spf';
import { checkDkim } from '../../../../lib/checks/dkim';
import { checkDmarc } from '../../../../lib/checks/dmarc';
import { CheckResult } from '../../../../lib/types/scanner';

// Widget endpoint - DNS-only checks for embeddable widgets
// No SMTP connectivity checks to avoid timeout issues in browser context

export interface WidgetScanResponse {
  scan_id: string;
  domain: string;
  timestamp: string;
  score: number;
  checks: {
    spf: CheckResult;
    dkim: CheckResult;
    dmarc: CheckResult;
  };
}

function generateScanId(): string {
  return `wscan_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
  return domainRegex.test(domain);
}

function createErrorResult(error: Error | unknown): CheckResult {
  return {
    status: 'fail' as const,
    score: 0,
    details: { error: String(error) },
    recommendations: ['Check DNS configuration and try again'],
    error: String(error),
  };
}

// CORS headers for widget embedding
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const domain = searchParams.get('domain');

  if (!domain) {
    return NextResponse.json(
      { error: 'Domain parameter is required' },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!isValidDomain(domain)) {
    return NextResponse.json(
      { error: 'Invalid domain format' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const scanId = generateScanId();

    // Run DNS-only checks in parallel (no SMTP/MX connectivity)
    const [spf, dkim, dmarc] = await Promise.all([
      checkSpf(domain).catch(createErrorResult),
      checkDkim(domain).catch(createErrorResult),
      checkDmarc(domain).catch(createErrorResult),
    ]);

    // Calculate score for DNS-only checks (equal weight)
    const overallScore = Math.round((spf.score + dkim.score + dmarc.score) / 3);

    const response: WidgetScanResponse = {
      scan_id: scanId,
      domain,
      timestamp: new Date().toISOString(),
      score: overallScore,
      checks: { spf, dkim, dmarc },
    };

    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    console.error('Widget scan error:', error);
    return NextResponse.json(
      { error: 'Failed to scan domain. Please try again.' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { domain?: string };
    const domain = body.domain;

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!isValidDomain(domain)) {
      return NextResponse.json(
        { error: 'Invalid domain format' },
        { status: 400, headers: corsHeaders }
      );
    }

    const scanId = generateScanId();

    // Run DNS-only checks in parallel
    const [spf, dkim, dmarc] = await Promise.all([
      checkSpf(domain).catch(createErrorResult),
      checkDkim(domain).catch(createErrorResult),
      checkDmarc(domain).catch(createErrorResult),
    ]);

    const overallScore = Math.round((spf.score + dkim.score + dmarc.score) / 3);

    const response: WidgetScanResponse = {
      scan_id: scanId,
      domain,
      timestamp: new Date().toISOString(),
      score: overallScore,
      checks: { spf, dkim, dmarc },
    };

    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    console.error('Widget scan error:', error);
    return NextResponse.json(
      { error: 'Failed to scan domain. Please try again.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
