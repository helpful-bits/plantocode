import { NextRequest, NextResponse } from 'next/server';
import { getCountryFromRequest, isApprovedRegion } from '@/lib/territories';

export async function GET(request: NextRequest) {
  // Check if this is a crawler/bot
  const userAgent = request.headers.get('user-agent') || '';
  const isBot = /bot|crawler|spider|facebookexternalhit|twitterbot|linkedinbot|googlebot/i.test(userAgent);
  
  // For bots, use consistent redirect to EU (GDPR-compliant) version
  // This ensures consistent indexing and follows 2025 SEO best practices
  if (isBot) {
    return NextResponse.redirect(
      new URL('/legal/eu/privacy', request.url),
      { status: 301 } // Permanent redirect for SEO
    );
  }
  
  // For human users, perform geo-based routing
  const country = getCountryFromRequest(
    request.headers,
    (request as any).geo
  );
  
  // Determine the appropriate region for human users
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
  
  // Build the redirect URL - use the correct base URL
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('host') || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;
  
  const redirectUrl = new URL(`/legal/${region}/privacy${hash}`, baseUrl);
  
  return NextResponse.redirect(
    redirectUrl,
    { status: 302 } // Temporary for geo-based user redirects
  );
}

// Also handle HEAD requests for efficiency
export async function HEAD(request: NextRequest) {
  return GET(request);
}