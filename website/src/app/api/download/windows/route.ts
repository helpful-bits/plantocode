import { NextRequest, NextResponse } from 'next/server';

// Server-side download tracking for Windows (preparation for future release)
export async function GET(req: NextRequest) {
  // Extract headers for proper analytics attribution
  const userAgent = req.headers.get('user-agent') || '';
  const xForwardedFor = req.headers.get('x-forwarded-for') || '';
  const clientIp = xForwardedFor ? xForwardedFor.split(',')[0]?.trim() || '' : '';
  const referer = req.headers.get('referer') || '';
  
  // Get query parameters for tracking context
  const searchParams = req.nextUrl.searchParams;
  const source = searchParams.get('source') || 'direct';
  const version = searchParams.get('version') || 'latest';
  
  // Track with Plausible (server-side) - direct call with proper headers
  try {
    // Call Plausible directly from server-side with proper client headers
    await fetch('https://plausible.io/api/event', {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'X-Forwarded-For': clientIp,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Download',
        url: 'https://www.vibemanager.app/download/windows',
        domain: 'vibemanager.app',
        referrer: referer,
        props: {
          source,
          version,
          platform: 'windows'
        }
      }),
    });
  } catch (error) {
    console.error('Plausible tracking error:', error);
  }

  // For now, redirect to coming soon page or waitlist
  // When Windows version is ready, update this to redirect to actual download
  const comingSoonUrl = 'https://www.vibemanager.app/#pricing';
  
  return NextResponse.redirect(comingSoonUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}