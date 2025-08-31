import { NextRequest, NextResponse } from 'next/server';

// Server-side download tracking for Windows (preparation for future release)
export async function GET(req: NextRequest) {
  // Get query parameters for tracking context
  const searchParams = req.nextUrl.searchParams;
  const source = searchParams.get('source') || 'direct';
  const version = searchParams.get('version') || 'latest';
  
  // Track download event using unified analytics endpoint
  try {
    const trackingUrl = new URL('/api/analytics/track', req.url);
    await fetch(trackingUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward original request headers for proper attribution
        'User-Agent': req.headers.get('user-agent') || '',
        'X-Forwarded-For': req.headers.get('x-forwarded-for') || '',
        'Referer': req.headers.get('referer') || '',
      },
      body: JSON.stringify({
        event: 'download_click',
        url: 'https://vibemanager.app/download/windows',
        props: {
          location: source,
          version,
          platform: 'windows'
        }
      }),
    });
  } catch (error) {
    console.error('Download tracking error:', error);
    // Don't block download if tracking fails
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