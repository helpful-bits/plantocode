import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  isApprovedRegion,
  isSanctionedRegion,
  getCountryFromRequest,
  shouldGatePath,
} from '@/lib/territories';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // Skip geo-check for static assets
  if (path.startsWith('/_next')) {
    return NextResponse.next();
  }

  // Check if this is a search engine crawler - CRITICAL for SEO
  const userAgent = request.headers.get('user-agent') || '';
  const isSearchBot = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora|showyoubot|outbrain|pinterest|slackbot|vkshare|w3c_validator|redditbot/i.test(userAgent);

  // Get country from multiple sources (do this for ALL requests)
  const country = getCountryFromRequest(
    request.headers,
    (request as any).geo
  );
  
  // For geo detection endpoint, just add the header and continue
  if (path === '/api/geo' || path.startsWith('/api/health')) {
    const response = NextResponse.next();
    response.headers.set('X-User-Country', country);
    return response;
  }

  // CRITICAL: Allow all search engine crawlers unrestricted access for SEO
  if (isSearchBot) {
    const response = NextResponse.next();
    response.headers.set('X-User-Country', country);
    response.headers.set('X-Bot-Detected', 'true');
    return response;
  }

  // Check if this is the restricted page itself (avoid redirect loop)
  const isRestrictedPage = path.startsWith('/legal/restricted');

  // Check if country is sanctioned (but don't redirect if already on restricted page)
  if (isSanctionedRegion(country) && !isRestrictedPage) {
    return NextResponse.redirect(new URL('/legal/restricted', request.url));
  }

  // Check if path needs geo-gating
  if (shouldGatePath(path) && !isApprovedRegion(country)) {
    // For API calls, return JSON error with proper headers
    if (path.startsWith('/api/')) {
      const response = NextResponse.json(
        { 
          error: 'Service not available in your region',
          code: 'GEO_RESTRICTION_001',
          country: country,
          message: 'This service is only available in the United States, United Kingdom, and European Economic Area.'
        },
        { status: 451 } // 451 Unavailable For Legal Reasons
      );
      // Add Vary header to prevent CDN caching issues
      response.headers.set('Vary', 'CF-IPCountry, X-Vercel-IP-Country');
      response.headers.set('X-User-Country', country);
      return response;
    }
    
    // For app/download pages, redirect to restricted page
    return NextResponse.redirect(new URL('/legal/restricted', request.url));
  }

  // Allow access but add headers for downstream use
  const response = NextResponse.next();
  response.headers.set('X-User-Country', country);
  // Add Vary header to ensure CDN doesn't cache wrong response
  response.headers.set('Vary', 'CF-IPCountry, X-Vercel-IP-Country');
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * Note: Legal pages remain accessible worldwide for transparency
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};