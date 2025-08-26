'use client';

import { useCallback } from 'react';

declare global {
  interface Window {
    plausible: (
      event: string, 
      options?: { 
        props?: Record<string, string | number | boolean>;
        callback?: () => void;
        revenue?: { currency: string; amount: number | string };
        interactive?: boolean;
        u?: string;
      }
    ) => void;
  }
}

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
    trackEvent('Download Click', { 
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

  return { 
    trackEvent,
    trackDownload,
    trackSignupStart,
    trackCTAClick,
    trackFeatureView,
    trackSectionView,
    trackVideoPlay,
    trackDemoInteraction
  };
}