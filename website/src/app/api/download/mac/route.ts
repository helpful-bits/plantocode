import { NextRequest, NextResponse } from 'next/server';

// Server-side download tracking that bypasses ad blockers
export async function GET(req: NextRequest) {
  // Extract headers for proper analytics attribution
  const userAgent = req.headers.get('user-agent') || '';
  const xForwardedFor = req.headers.get('x-forwarded-for') || '';
  const clientIp = xForwardedFor ? xForwardedFor.split(',')[0]?.trim() || '' : '';
  const referer = req.headers.get('referer') || '';
  
  // Get query parameters for tracking context
  const searchParams = req.nextUrl.searchParams;
  const source = searchParams.get('source') || 'direct';
  const version = searchParams.get('version') || 'latest';
  
  // Track with Plausible (server-side) - direct call with proper headers
  try {
    // Call Plausible directly from server-side with proper client headers
    await fetch('https://plausible.io/api/event', {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'X-Forwarded-For': clientIp,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Download',
        url: 'https://www.vibemanager.app/download/mac',
        domain: 'vibemanager.app',
        referrer: referer,
        props: {
          source,
          version,
          platform: 'mac'
        }
      }),
    });
  } catch (error) {
    console.error('Plausible tracking error:', error);
    // Don't block download if tracking fails
  }

  // Track with X/Twitter pixel (server-side)
  if (process.env.NEXT_PUBLIC_X_PIXEL_ID && process.env.NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID) {
    try {
      const pixelId = process.env.NEXT_PUBLIC_X_PIXEL_ID;
      const eventId = process.env.NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID;
      
      // X/Twitter server-side conversion tracking
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
      // Don't block download if tracking fails
    }
  }

  // Track with Google Analytics 4 (server-side via Measurement Protocol)
  if (process.env.GA_MEASUREMENT_ID && process.env.GA_API_SECRET) {
    try {
      const measurementId = process.env.GA_MEASUREMENT_ID;
      const apiSecret = process.env.GA_API_SECRET;
      
      // Generate a client ID (should ideally be persisted per user)
      const clientId = req.cookies.get('_ga')?.value?.replace(/^GA\d\.\d\./, '') || 
                      `${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
      
      // Call GA directly from server-side
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
              link_url: 'https://www.vibemanager.app/download/mac',
              link_domain: 'vibemanager.app',
              source,
              version,
              engagement_time_msec: '100',
            }
          }]
        }),
      });
    } catch (error) {
      console.error('GA4 tracking error:', error);
      // Don't block download if tracking fails
    }
  }

  // Redirect to the actual download URL
  const downloadUrl = process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL || 
                     'https://d2tyb0wucqqf48.cloudfront.net/releases/VibeManager.dmg';
  
  // Use 302 redirect to ensure download starts
  return NextResponse.redirect(downloadUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

// Handle HEAD requests for pre-flight checks
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}