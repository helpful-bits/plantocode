import { NextResponse } from 'next/server';

// Server-side download handler for Windows (preparation for future release)
export async function GET() {
  
  // Download tracking is handled client-side to preserve user context

  // For now, redirect to coming soon page or waitlist
  // When Windows version is ready, update this to redirect to actual download
  const comingSoonUrl = 'https://www.plantocode.com/#pricing';
  
  // Create response with redirect
  const response = NextResponse.redirect(comingSoonUrl, 302);
  
  // Add CORS headers to allow tracking from client
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', '*');
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  return response;
}

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