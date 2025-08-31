/**
 * Unified client-side tracking utility
 * All events are sent to server-side analytics endpoint for ad-blocker proof tracking
 */

interface TrackEventOptions {
  event: string;
  props?: Record<string, string | number | boolean>;
  url?: string;
}

/**
 * Track an analytics event via server-side endpoint
 * This bypasses ad blockers and provides consistent tracking
 */
export const track = async (options: TrackEventOptions): Promise<void> => {
  // Don't track in development unless explicitly enabled
  if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_TRACK_DEV) {
    return;
  }

  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
      keepalive: true, // Improve delivery during unload
    });
  } catch (error) {
    // Fallback: try sendBeacon
    try {
      if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
        const blob = new Blob([JSON.stringify(options)], { type: 'application/json' });
        navigator.sendBeacon('/api/analytics/track', blob);
        return;
      }
    } catch {
      // ignore beacon errors
    }
    
    // Last-resort fetch without keepalive
    try {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      }).catch(() => {});
    } catch {
      // ignore final fallback errors
    }
    
    // Original debug logging
    console.debug('Tracking failed:', error);
  }
};

/**
 * Convenience functions for common event types
 */
export const trackDemo = (stepName: string, action: string = 'view') => 
  track({ event: 'Demo Interaction', props: { step: stepName, action } });

export const trackFAQ = (question: string, index: number) =>
  track({ event: 'faq_expand', props: { question: question.substring(0, 100), index } });

export const trackVideo = (videoTitle: string, action: 'play' | 'complete', duration?: number) =>
  track({ 
    event: action === 'play' ? 'Video Play' : 'video_complete', 
    props: { video: videoTitle, ...(duration && { duration }) } 
  });

export const trackScroll = (percentage: number) =>
  track({ event: 'scroll_depth', props: { percentage } });