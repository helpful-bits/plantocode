'use client';

import { useCallback } from 'react';

export function usePlausible() {
  const trackEvent = useCallback((eventName: string, options?: {
    props?: Record<string, string | number | boolean>;
    callback?: () => void;
    interactive?: boolean;
    revenue?: { currency: string; amount: number };
    u?: string;
  }) => {
    if (typeof window !== 'undefined' && window.plausible) {
      window.plausible(eventName, options);
    }
  }, []);

  // Specific funnel event handlers
  const trackDownload = useCallback((location: string, version?: string, callback?: () => void) => {
    trackEvent('download_click', { 
      props: {
        location, 
        version: version || 'latest'
      },
      ...(callback ? { callback } : {})
    });
  }, [trackEvent]);

  const trackSignupStart = useCallback((source: string) => {
    trackEvent('Signup Start', { 
      props: {
        source
      }
    });
  }, [trackEvent]);

  const trackCTAClick = useCallback((ctaName: string, location: string, callback?: () => void) => {
    trackEvent('CTA Click', { 
      props: {
        cta_name: ctaName,
        location
      },
      ...(callback ? { callback } : {})
    });
  }, [trackEvent]);

  const trackFeatureView = useCallback((featureName: string) => {
    trackEvent('Feature View', { 
      props: {
        feature: featureName
      }
    });
  }, [trackEvent]);

  const trackSectionView = useCallback((sectionName: string) => {
    trackEvent('Section View', { 
      props: {
        section: sectionName
      },
      interactive: false
    });
  }, [trackEvent]);

  const trackVideoPlay = useCallback((videoTitle: string) => {
    trackEvent('Video Play', { 
      props: {
        video: videoTitle
      }
    });
  }, [trackEvent]);

  const trackDemoInteraction = useCallback((stepName: string, action?: string) => {
    trackEvent('Demo Interaction', { 
      props: {
        step: stepName,
        action: action || 'view'
      }
    });
  }, [trackEvent]);

  const trackScrollDepth = useCallback((percentage: number) => {
    trackEvent('scroll_depth', { 
      props: {
        percentage
      }
    });
  }, [trackEvent]);

  const trackAnchorClick = useCallback((anchor: string, from: string) => {
    trackEvent('anchor_click', { 
      props: {
        anchor,
        from
      }
    });
  }, [trackEvent]);

  const trackVideoComplete = useCallback((videoTitle: string, duration?: number) => {
    trackEvent('video_complete', { 
      props: {
        video: videoTitle,
        ...(duration ? { duration } : {})
      }
    });
  }, [trackEvent]);

  const trackFAQExpand = useCallback((question: string, index: number) => {
    trackEvent('faq_expand', { 
      props: {
        question,
        index
      }
    });
  }, [trackEvent]);

  const trackCopyCommand = useCallback((command: string, location: string) => {
    trackEvent('copy_command', { 
      props: {
        command,
        location
      }
    });
  }, [trackEvent]);

  const trackEngagementTime = useCallback((sectionName: string, timeSpent: number) => {
    trackEvent('engagement_time', { 
      props: {
        section: sectionName,
        time_seconds: Math.round(timeSpent)
      }
    });
  }, [trackEvent]);

  const trackHeaderClick = useCallback((item: string) => {
    trackEvent('header_click', { 
      props: {
        item
      }
    });
  }, [trackEvent]);

  return { 
    trackEvent,
    trackDownload,
    trackSignupStart,
    trackCTAClick,
    trackFeatureView,
    trackSectionView,
    trackVideoPlay,
    trackDemoInteraction,
    trackScrollDepth,
    trackAnchorClick,
    trackVideoComplete,
    trackFAQExpand,
    trackCopyCommand,
    trackEngagementTime,
    trackHeaderClick
  };
}