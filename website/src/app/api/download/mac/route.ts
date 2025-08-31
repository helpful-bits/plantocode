import { NextResponse } from 'next/server';

// Server-side download handler that redirects to CDN
export async function GET() {
  
  // Download tracking is handled client-side to preserve user context

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