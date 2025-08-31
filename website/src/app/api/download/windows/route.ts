import { NextResponse } from 'next/server';

// Server-side download handler for Windows (preparation for future release)
export async function GET() {
  
  // Download tracking is handled client-side to preserve user context

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