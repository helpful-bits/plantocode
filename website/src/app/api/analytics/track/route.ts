import { NextRequest, NextResponse } from 'next/server';

interface TrackingEvent {
  event: string;
  props?: Record<string, string | number | boolean>;
  url?: string;
  screen_width?: number;
  referrer?: string;
}

// Unified server-side analytics tracking that bypasses ad blockers
export async function POST(req: NextRequest) {
  try {
    // Extract headers for proper analytics attribution
    const userAgent = req.headers.get('user-agent') || '';
    const xForwardedFor = req.headers.get('x-forwarded-for') || '';
    const clientIp = xForwardedFor ? xForwardedFor.split(',')[0]?.trim() || '' : '';
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
          const key = k.length > 300 ? k.slice(0, 300) : k;
          const val = t === 'string' && (v as string).length > 2000 ? (v as string).slice(0, 2000) : v;
          sanitizedProps[key] = val;
        }
      }
    }

    // Build headers
    const plausibleHeaders: Record<string, string> = {
      'User-Agent': userAgent || 'unknown',
      'Content-Type': 'application/json',
    };
    if (clientIp) {
      plausibleHeaders['X-Forwarded-For'] = clientIp;
    }
    if (process.env.NEXT_PUBLIC_PLAUSIBLE_DEBUG === 'true') {
      plausibleHeaders['X-Debug-Request'] = 'true';
    }

    try {
      const plausibleRes = await fetch('https://plausible.io/api/event', {
        method: 'POST',
        headers: plausibleHeaders,
        body: JSON.stringify({
          name: event, // Correct: Plausible API requires 'name' field
          url: plausibleUrl,
          domain: plausibleDomain,
          referrer: clientReferrer || referer || undefined,
          screen_width: screen_width || undefined,
          props: Object.keys(sanitizedProps).length ? sanitizedProps : undefined,
        }),
      });

      if (![202, 200].includes(plausibleRes.status)) {
        console.warn('Plausible tracking returned non-202/200:', plausibleRes.status, await plausibleRes.text());
      }
    } catch (error) {
      console.error('Plausible tracking error:', error);
    }

    // Special handling for download events - also track with X/Twitter and GA4
    if (event === 'download_click') {
      const location = props.location as string || 'unknown';
      const version = props.version as string || 'latest';

      // Track with X Pixel (server-side emulation of client pixel)
      if (process.env.NEXT_PUBLIC_X_PIXEL_ID && process.env.NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID) {
        try {
          const pixelId = process.env.NEXT_PUBLIC_X_PIXEL_ID;
          const eventId = process.env.NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID;
          const conversionId = `download-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          
          // Extract Twitter Click ID if available (critical for attribution)
          const twclid = (props.twclid as string) || '';
          
          // Build X Pixel parameters (emulating client-side pixel)
          const pixelParams = new URLSearchParams({
            // Core pixel parameters
            bci: pixelId, // Base/Brand Conversion ID
            eci: eventId, // Event Conversion ID  
            event_id: conversionId, // Unique event identifier for deduplication
            p_id: 'Twitter', // Platform identifier
            
            // Transaction parameters
            tw_sale_amount: '0', // Sale amount (can be customized)
            tw_order_quantity: '1', // Order quantity
            
            // User context parameters (if available)
            ...(twclid && { twclid }), // Twitter Click ID for attribution
            ...(clientReferrer && { tw_document_href: clientReferrer }),
            
            // Additional context
            tw_iframe: '0', // Not in iframe
            tpd: plausibleDomain, // Third party domain
            
            // Screen dimensions (if available)
            ...(screen_width && { tw_fio: screen_width.toString() }),
            
            // Language/locale (from props if available)  
            ...(props.language && { tw_lang: props.language as string }),
          });
          
          // Send to both tracking endpoints (mobile + desktop)
          const endpoints = [
            'https://t.co/1/i/adsct', // Mobile tracking
            'https://analytics.twitter.com/1/i/adsct', // Desktop tracking
          ];
          
          const pixelHeaders = {
            'User-Agent': userAgent || 'Mozilla/5.0 (compatible; ServerSidePixel/1.0)',
            'Accept': 'image/gif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
            'Accept-Language': (props.language as string) || 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            ...(clientIp && { 'X-Forwarded-For': clientIp }),
            ...(clientReferrer && { 'Referer': clientReferrer }),
          };
          
          // Send pixel requests to both endpoints
          const pixelPromises = endpoints.map(async (endpoint) => {
            try {
              const pixelUrl = `${endpoint}?${pixelParams.toString()}`;
              const pixelRes = await fetch(pixelUrl, {
                method: 'GET',
                headers: pixelHeaders,
                // Pixel requests should be fire-and-forget
              });
              
              if (!pixelRes.ok && pixelRes.status !== 204) {
                console.warn(`X Pixel endpoint ${endpoint} returned ${pixelRes.status}`);
              }
            } catch (err) {
              console.debug(`X Pixel endpoint ${endpoint} failed:`, err);
            }
          });
          
          // Execute all pixel requests in parallel
          await Promise.allSettled(pixelPromises);
          
        } catch (error) {
          console.error('X Pixel tracking error:', error);
        }
      }

      // Track with Google Analytics 4 (server-side)
      if (process.env.GA_MEASUREMENT_ID && process.env.GA_API_SECRET) {
        try {
          const measurementId = process.env.GA_MEASUREMENT_ID;
          const apiSecret = process.env.GA_API_SECRET;
          
          const clientId = req.cookies.get('_ga')?.value?.replace(/^GA\d\.\d\./, '') || 
                          `${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
          
          await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              client_id: clientId,
              events: [{
                name: 'download',
                params: {
                  file_extension: 'dmg',
                  file_name: 'VibeManager.dmg',
                  link_url: trackingUrl,
                  link_domain: 'vibemanager.app',
                  source: location,
                  version,
                  engagement_time_msec: '100',
                }
              }]
            }),
          });
        } catch (error) {
          console.error('GA4 tracking error:', error);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// Handle HEAD requests for pre-flight checks
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}