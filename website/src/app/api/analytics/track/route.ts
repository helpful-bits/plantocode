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
    try {
      await fetch('https://plausible.io/api/event', {
        method: 'POST',
        headers: {
          'User-Agent': userAgent,
          'X-Forwarded-For': clientIp,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: event,
          url: trackingUrl,
          domain: 'vibemanager.app',
          referrer: referer,
          props: props
        }),
      });
    } catch (error) {
      console.error('Plausible tracking error:', error);
      // Don't block the response if tracking fails
    }

    // Special handling for download events - also track with X/Twitter and GA4
    if (event === 'download_click') {
      const location = props.location as string || 'unknown';
      const version = props.version as string || 'latest';

      // Track with X/Twitter pixel (server-side)
      if (process.env.NEXT_PUBLIC_X_PIXEL_ID && process.env.NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID) {
        try {
          const pixelId = process.env.NEXT_PUBLIC_X_PIXEL_ID;
          const eventId = process.env.NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID;
          
          const xTrackingUrl = new URL('https://t.co/1/i/adsct');
          xTrackingUrl.searchParams.append('bci', pixelId);
          xTrackingUrl.searchParams.append('eci', eventId);
          xTrackingUrl.searchParams.append('event_id', `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
          xTrackingUrl.searchParams.append('p_id', 'Twitter');
          xTrackingUrl.searchParams.append('tw_sale_amount', '0');
          xTrackingUrl.searchParams.append('tw_order_quantity', '1');
          
          await fetch(xTrackingUrl.toString(), {
            method: 'GET',
            headers: {
              'User-Agent': userAgent,
              'X-Forwarded-For': clientIp,
              'Referer': referer,
            },
          });
        } catch (error) {
          console.error('X/Twitter tracking error:', error);
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