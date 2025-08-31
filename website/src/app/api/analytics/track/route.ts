import { NextRequest, NextResponse } from 'next/server';

interface TrackingEvent {
  event: string;
  props?: Record<string, string | number | boolean>;
  url?: string;
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
    const { event, props = {}, url } = body;
    
    if (!event) {
      return NextResponse.json({ error: 'Event name is required' }, { status: 400 });
    }

    const trackingUrl = url || referer || 'https://www.vibemanager.app';

    // Track with Plausible (server-side) - handles all event types
    const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || 'vibemanager.app';
    const canonicalOrigin = `https://${plausibleDomain}`;

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
          name: event,
          url: plausibleUrl,
          domain: plausibleDomain,
          referrer: referer || undefined,
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

      // Track with X Conversions API (server-side)
      if (process.env.X_ADS_API_TOKEN && process.env.X_DOWNLOAD_EVENT_ID) {
        try {
          const eventId = process.env.X_DOWNLOAD_EVENT_ID;
          const conversionId = `download-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

          // Build identifiers (prefer twclid when available)
          const identifiers: Array<Record<string, string>> = [];
          const twclid = (props.twclid as string) || '';
          if (twclid) {
            identifiers.push({ twclid });
          }
          // Include ip + ua for better attribution
          identifiers.push({ ip_address: clientIp || '', user_agent: userAgent || '' });

          const xApiUrl = `https://ads-api.x.com/12/measurement/conversions/${eventId}`;
          const xApiPayload = {
            conversions: [
              {
                conversion_time: new Date().toISOString(),
                event_id: eventId,
                conversion_id: conversionId,
                identifiers,
              },
            ],
          };

          const xRes = await fetch(xApiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.X_ADS_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(xApiPayload),
          });

          if (!xRes.ok) {
            console.warn('X Conversions API returned non-ok:', xRes.status, await xRes.text());
          }
        } catch (error) {
          console.error('X Conversions API error:', error);
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