import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  isApprovedRegion,
  isSanctionedRegion,
  getCountryFromRequest,
  shouldGatePath,
} from '@/lib/territories';
import { locales, defaultLocale, type Locale } from '@/i18n/config';

// Regex for non-default locale detection
const nonDefaultLocales = locales.filter((l: Locale) => l !== defaultLocale);
const LOCALE_RE = new RegExp(`^/(${nonDefaultLocales.join('|')})(\/|$)`);

// Regex for assets and API routes (pass through without i18n handling)
const ASSET_RE = /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$/;

export default async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // ============================================
  // LOCALE ROUTING (App Router i18n)
  // Canonical URL strategy: English (en) has NO prefix
  // ============================================

  // 1. Skip assets and Next.js internal routes early
  if (
    path.startsWith('/_next') ||
    path.startsWith('/api/') ||
    path.startsWith('/auth/') ||
    path.startsWith('/billing/') ||
    ASSET_RE.test(path) ||
    path === '/site.webmanifest' ||
    path === '/manifest.json' ||
    path === '/favicon.ico' ||
    path === '/robots.txt' ||
    path === '/sitemap.xml' ||
    path === '/sitemap-video.xml' ||
    path === '/sitemap-image.xml'
  ) {
    return NextResponse.next();
  }

  // 2. Canonicalize /en prefix: redirect /en/* → /*
  if (path === '/en' || path.startsWith('/en/')) {
    const url = request.nextUrl.clone();
    // Remove /en prefix: /en/about → /about, /en → /
    url.pathname = path === '/en' ? '/' : path.slice(3);
    return NextResponse.redirect(url, 308); // 308 Permanent Redirect
  }

  // 3. Handle non-English prefixes (de, fr, es)
  const localeMatch = path.match(LOCALE_RE);
  let matchedLocale: Locale = defaultLocale;

  if (localeMatch) {
    matchedLocale = localeMatch[1] as Locale;
  }

  // 4. Default (unprefixed): assume English, will rewrite to /en/*
  const isUnprefixed = !localeMatch;

  // ============================================
  // GEO-GATING LOGIC
  // ============================================

  // Get country from multiple sources (do this for ALL requests)
  const country = getCountryFromRequest(
    request.headers,
    (request as any).geo
  );

  // Check if this is the restricted page itself (avoid redirect loop)
  // With canonical URLs: /legal/restricted (en), /de/legal/restricted, etc.
  const isRestrictedPage = path.includes('/legal/restricted');

  // Check if country is sanctioned (but don't redirect if already on restricted page)
  if (isSanctionedRegion(country) && !isRestrictedPage) {
    // Canonical URLs: /legal/restricted for English, /de/legal/restricted for German, etc.
    const restrictedPath = matchedLocale === 'en'
      ? '/legal/restricted'
      : `/${matchedLocale}/legal/restricted`;
    return NextResponse.redirect(new URL(restrictedPath, request.url));
  }

  // Check if path needs geo-gating
  if (shouldGatePath(path) && !isApprovedRegion(country)) {
    // For app/download pages, redirect to locale-aware restricted page
    const restrictedPath = matchedLocale === 'en'
      ? '/legal/restricted'
      : `/${matchedLocale}/legal/restricted`;
    return NextResponse.redirect(new URL(restrictedPath, request.url));
  }

  // ============================================
  // LOCALE HEADER INJECTION & REWRITING
  // ============================================

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-locale', matchedLocale);
  requestHeaders.set('x-next-locale', matchedLocale);

  // For unprefixed URLs, rewrite to /en/*
  let response;
  if (isUnprefixed) {
    const url = request.nextUrl.clone();
    url.pathname = `/en${path}`;
    response = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
  } else {
    // For non-English locales (de, fr, es), proceed without rewrite
    response = NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Add headers for downstream use
  response.headers.set('X-User-Country', country);

  // Add Vary header to ensure CDN doesn't cache wrong response
  const existingVary = response.headers.get('Vary');
  const varyHeaders = ['CF-IPCountry', 'X-Vercel-IP-Country', 'CF-Connecting-IP'];
  if (existingVary) {
    const existingValues = existingVary.split(',').map(v => v.trim());
    const mergedVary = Array.from(new Set([...existingValues, ...varyHeaders])).join(', ');
    response.headers.set('Vary', mergedVary);
  } else {
    response.headers.set('Vary', varyHeaders.join(', '));
  }

  return response;
}

// Named export for backwards compatibility
export { middleware as proxy };

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder / static assets
     * Note: Legal pages remain accessible worldwide for transparency
     * Note: Plausible proxy paths (/js/script*, /api/event) are handled by withPlausibleProxy
     * Note: This matcher also handles locale routing for all content pages
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};