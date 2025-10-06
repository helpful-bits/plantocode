import { NextRequest, NextResponse } from 'next/server';
import { getClientIpFromHeaders } from '@/lib/request';

interface TrackingEvent {
  event: string;
  props?: Record<string, string | number | boolean>;
  url?: string;
  screen_width?: number;
  referrer?: string;
}

// Server-side Plausible analytics tracking (cookie-free, GDPR compliant)
// Note: X Pixel tracking is handled client-side via XPixel component
export async function POST(req: NextRequest) {
  try {
    // Extract headers for proper analytics attribution
    const userAgent = req.headers.get('user-agent') || '';
    const clientIp = getClientIpFromHeaders(req.headers);
    const referer = req.headers.get('referer') || '';
    
    // Parse request body
    const body: TrackingEvent = await req.json();
    const { event, props = {}, url, screen_width, referrer: clientReferrer } = body;
    
    if (!event) {
      return NextResponse.json({ error: 'Event name is required' }, { status: 400 });
    }

    const trackingUrl = url || referer || 'https://www.vibemanager.app';

    // Track with Plausible (server-side) - handles all event types
    // Domain should match what's configured in Plausible dashboard (typically without www)
    const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || 'vibemanager.app';
    // Use the actual canonical URL (with www) for the URL field
    const canonicalOrigin = 'https://www.vibemanager.app';

    // Make URL absolute
    let plausibleUrl = trackingUrl;
    if (plausibleUrl.startsWith('/')) {
      plausibleUrl = canonicalOrigin.replace(/\/$/, '') + plausibleUrl;
    }

    // Sanitize props (flat, scalar, ≤30 keys)
    const sanitizedProps: Record<string, string | number | boolean> = {};
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      const keys = Object.keys(props).slice(0, 30);
      for (const k of keys) {
        const v = props[k];
        if (v == null) continue;
        const t = typeof v;
        if (t === 'string' || t === 'number' || t === 'boolean') {
          sanitizedProps[k] = v;
        }
      }
    }

    const plausibleRequest = {
      name: event,
      props: sanitizedProps,
      domain: plausibleDomain,
      url: plausibleUrl,
      referrer: clientReferrer || '',
      screen_width: screen_width || 0,
    };

    const plausibleFetch = fetch('https://plausible.io/api/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        'X-Forwarded-For': clientIp || '',
      },
      body: JSON.stringify(plausibleRequest),
    });

    // Fire and forget - don't wait for response
    plausibleFetch.catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Event tracked with Plausible Analytics (cookie-free)'
    });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    return NextResponse.json({ 
      error: 'Failed to track event',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}