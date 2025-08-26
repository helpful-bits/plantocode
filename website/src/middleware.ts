import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  isApprovedRegion,
  isSanctionedRegion,
  getCountryFromRequest,
  shouldGatePath,
} from '@/lib/territories';

// Helper function to get client's real IP
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  
  return cfConnectingIp || (forwardedFor ? forwardedFor.split(',')[0]?.trim() || '' : '') || realIp || '';
}

// Handle analytics proxy with proper header forwarding
async function handleAnalyticsProxy(request: NextRequest): Promise<NextResponse | null> {
  const url = request.nextUrl.clone();
  const clientIp = getClientIp(request);
  
  // Handle Plausible script proxy
  if (url.pathname.startsWith('/js/script')) {
    const plausibleUrl = new URL(`https://plausible.io${url.pathname}`);
    
    const response = await fetch(plausibleUrl.toString(), {
      headers: {
        'User-Agent': request.headers.get('user-agent') || '',
        'X-Forwarded-For': clientIp,
        'X-Real-IP': clientIp,
        'X-Forwarded-Host': request.headers.get('host') || '',
        'X-Forwarded-Proto': request.headers.get('x-forwarded-proto') || 'https',
        'Accept-Language': request.headers.get('accept-language') || '',
        'Referer': request.headers.get('referer') || '',
      },
    });
    
    const newResponse = new NextResponse(response.body, response);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        newResponse.headers.set(key, value);
      }
    });
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    return newResponse;
  }
  
  // Handle Plausible event proxy
  if (url.pathname === '/api/event') {
    const plausibleUrl = new URL('https://plausible.io/api/event');
    
    const response = await fetch(plausibleUrl.toString(), {
      method: request.method,
      body: request.body,
      headers: {
        'User-Agent': request.headers.get('user-agent') || '',
        'X-Forwarded-For': clientIp,
        'X-Real-IP': clientIp,
        'X-Forwarded-Host': request.headers.get('host') || '',
        'X-Forwarded-Proto': request.headers.get('x-forwarded-proto') || 'https',
        'Content-Type': request.headers.get('content-type') || 'application/json',
        'Accept-Language': request.headers.get('accept-language') || '',
        'Referer': request.headers.get('referer') || '',
      },
    });
    
    return new NextResponse(response.body, response);
  }
  
  // Handle Google Analytics proxy
  if (url.pathname.startsWith('/ga/')) {
    let gaUrl: string;
    if (url.pathname === '/ga/gtag.js') {
      gaUrl = `https://www.googletagmanager.com/gtag/js${url.search}`;
    } else if (url.pathname === '/ga/analytics.js') {
      gaUrl = 'https://www.google-analytics.com/analytics.js';
    } else if (url.pathname === '/ga/collect') {
      gaUrl = `https://www.google-analytics.com/collect${url.search}`;
    } else if (url.pathname === '/ga/g/collect') {
      gaUrl = `https://www.google-analytics.com/g/collect${url.search}`;
    } else if (url.pathname === '/ga/mp/collect') {
      gaUrl = `https://www.google-analytics.com/mp/collect${url.search}`;
    } else {
      return null;
    }
    
    const response = await fetch(gaUrl, {
      method: request.method,
      body: request.body,
      headers: {
        'User-Agent': request.headers.get('user-agent') || '',
        'X-Forwarded-For': clientIp,
        'X-Real-IP': clientIp,
        'Accept-Language': request.headers.get('accept-language') || '',
        'Referer': request.headers.get('referer') || '',
        'Content-Type': request.headers.get('content-type') || '',
      },
    });
    
    const newResponse = new NextResponse(response.body, response);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        newResponse.headers.set(key, value);
      }
    });
    return newResponse;
  }
  
  // Handle X/Twitter pixel proxy
  if (url.pathname.startsWith('/x/')) {
    let xUrl: string;
    if (url.pathname === '/x/pixel.js') {
      xUrl = 'https://static.ads-twitter.com/uwt.js';
    } else if (url.pathname === '/x/event') {
      xUrl = 'https://t.co/1/i/adsct';
    } else if (url.pathname === '/x/config') {
      xUrl = 'https://analytics.twitter.com/1/i/config/account';
    } else {
      return null;
    }
    
    const response = await fetch(xUrl, {
      method: request.method,
      body: request.body,
      headers: {
        'User-Agent': request.headers.get('user-agent') || '',
        'X-Forwarded-For': clientIp,
        'X-Real-IP': clientIp,
        'Accept-Language': request.headers.get('accept-language') || '',
        'Referer': request.headers.get('referer') || '',
        'Content-Type': request.headers.get('content-type') || '',
      },
    });
    
    const newResponse = new NextResponse(response.body, response);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        newResponse.headers.set(key, value);
      }
    });
    return newResponse;
  }
  
  return null;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // Skip geo-check for static assets
  if (path.startsWith('/_next')) {
    return NextResponse.next();
  }
  
  // Handle analytics proxy requests first (before geo-blocking)
  const analyticsResponse = await handleAnalyticsProxy(request);
  if (analyticsResponse) {
    return analyticsResponse;
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
     * 
     * Also explicitly match analytics proxy paths:
     * - /js/script* (Plausible scripts)
     * - /api/event (Plausible events)
     * - /ga/* (Google Analytics)
     * - /x/* (X/Twitter pixel)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/js/script:path*',
    '/api/event',
    '/ga/:path*',
    '/x/:path*',
  ],
};