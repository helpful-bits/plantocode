/**
 * Unified client-side tracking utility
 * All events are sent to server-side analytics endpoint for ad-blocker proof tracking
 */

interface TrackEventOptions {
  event: string;
  props?: Record<string, string | number | boolean>;
  url?: string;
  screen_width?: number;
  referrer?: string;
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

  // Collect client-side information for better tracking
  const trackingData = {
    ...options,
    // Add screen width if not provided (critical for device categorization)
    screen_width: options.screen_width || (typeof window !== 'undefined' ? window.screen.width : undefined),
    // Add current URL if not provided
    url: options.url || (typeof window !== 'undefined' ? window.location.href : undefined),
    // Add referrer if not provided  
    referrer: options.referrer || (typeof document !== 'undefined' ? document.referrer : undefined),
    // Add additional context in props for enhanced tracking
    props: {
      ...options.props,
      // Add timezone for better user context (if not already provided)
      ...(typeof Intl !== 'undefined' && !options.props?.timezone && {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
      // Add language for better user context (if not already provided)  
      ...(typeof navigator !== 'undefined' && !options.props?.language && {
        language: navigator.language,
      }),
    },
  };

  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(trackingData),
      keepalive: true, // Improve delivery during unload
    });
  } catch (error) {
    // Fallback: try sendBeacon
    try {
      if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
        const blob = new Blob([JSON.stringify(trackingData)], { type: 'application/json' });
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
        body: JSON.stringify(trackingData),
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

export const trackPageview = (url?: string) => 
  track({ event: 'pageview', ...(url && { url }) });