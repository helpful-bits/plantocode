import { NextRequest, NextResponse } from 'next/server';

interface TrackingEvent {
  event: string;
  props?: Record<string, string | number | boolean>;
  url?: string;
  screen_width?: number;
  referrer?: string;
}

// Server-side analytics tracking endpoint
// GA4 tracking is handled client-side, X Pixel is handled via XPixel component
export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body: TrackingEvent = await req.json();
    const { event } = body;

    if (!event) {
      return NextResponse.json({ error: 'Event name is required' }, { status: 400 });
    }

    // This endpoint exists for future server-side tracking needs
    // Currently, GA4 is tracked client-side and X Pixel via consent-gated component
    return NextResponse.json({
      success: true,
      message: 'Event received'
    });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    return NextResponse.json({
      error: 'Failed to track event',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
