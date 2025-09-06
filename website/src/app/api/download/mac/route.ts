import { NextResponse } from 'next/server';

// Server-side download handler that redirects to CDN
export async function GET() {
  
  // Download tracking is handled client-side to preserve user context

  // Redirect to the actual download URL (using stable link)
  const downloadUrl = process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL || 
                     'https://d2tyb0wucqqf48.cloudfront.net/desktop/mac/stable/latest.dmg';
  
  // Create response with redirect
  const response = NextResponse.redirect(downloadUrl, 302);
  
  // Add CORS headers to allow tracking from client
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', '*');
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  return response;
}

// Handle HEAD requests for pre-flight checks
export async function HEAD() {
  return new NextResponse(null, { 
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD',
    }
  });
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    }
  });
}