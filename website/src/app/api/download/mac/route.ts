import { NextRequest, NextResponse } from 'next/server';

// Server-side download tracking that bypasses ad blockers
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
        url: 'https://www.vibemanager.app/download/mac',
        props: {
          location: source,
          version,
          platform: 'mac'
        }
      }),
    });
  } catch (error) {
    console.error('Download tracking error:', error);
    // Don't block download if tracking fails
  }

  // Redirect to the actual download URL (using stable link)
  const downloadUrl = process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL || 
                     'https://d2tyb0wucqqf48.cloudfront.net/desktop/mac/stable/latest.dmg';
  
  // Use 302 redirect to CloudFront
  // Note: CloudFront should be configured with Content-Disposition header
  // to trigger automatic download instead of showing Save dialog
  return NextResponse.redirect(downloadUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

// Handle HEAD requests for pre-flight checks
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}