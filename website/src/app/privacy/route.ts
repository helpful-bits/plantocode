import { NextRequest, NextResponse } from 'next/server';
import { getCountryFromRequest, isApprovedRegion } from '@/lib/territories';

export async function GET(request: NextRequest) {
  // Get the user's country from headers (set by middleware)
  const country = getCountryFromRequest(
    request.headers,
    (request as any).geo
  );
  
  // Determine the appropriate region
  let region: 'eu' | 'us';
  
  if (country === 'US') {
    region = 'us';
  } else if (isApprovedRegion(country)) {
    // EU/UK/EEA countries
    region = 'eu';
  } else {
    // For non-approved regions or unknown, default to EU (more protective)
    region = 'eu';
  }
  
  // Check if there's a hash fragment (like #cookies) to preserve
  const url = new URL(request.url);
  const hash = url.hash;
  
  // Redirect to the appropriate regional privacy page
  const redirectUrl = new URL(`/legal/${region}/privacy${hash}`, request.url);
  
  return NextResponse.redirect(
    redirectUrl,
    { status: 302 } // Use 302 for temporary redirect since it's based on location
  );
}

// Also handle HEAD requests for efficiency
export async function HEAD(request: NextRequest) {
  return GET(request);
}