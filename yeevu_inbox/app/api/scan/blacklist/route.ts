import { NextRequest, NextResponse } from 'next/server';
import { checkBlacklist } from '../../../../lib/checks/blacklist';
import { isDomainBlocked, getBlockedDomainError } from '../../../../lib/utils/blocklist';

function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
  return domainRegex.test(domain);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const domain = searchParams.get('domain');

  if (!domain) {
    return NextResponse.json(
      { error: 'Domain parameter is required' },
      { status: 400 }
    );
  }

  if (!isValidDomain(domain)) {
    return NextResponse.json(
      { error: 'Invalid domain format' },
      { status: 400 }
    );
  }


  if (isDomainBlocked(domain)) {
    return NextResponse.json(getBlockedDomainError(), { status: 403 });
  }

  try {
    const result = await checkBlacklist(domain);
    return NextResponse.json({
      check: 'blacklist',
      domain,
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (error) {
    console.error('Blacklist check error:', error);
    return NextResponse.json(
      {
        error: 'Failed to check blacklists',
        blacklist: {
          status: 'warn',
          score: 50,
          details: { error: String(error) },
          recommendations: ['Try again later or check manually at https://rbl-check.org/'],
        }
      },
      { status: 500 }
    );
  }
}
