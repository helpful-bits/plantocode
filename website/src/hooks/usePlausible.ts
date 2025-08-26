'use client';

import { useCallback } from 'react';

declare global {
  interface Window {
    plausible: (eventName: string, options?: { props?: Record<string, string | number> }) => void;
  }
}

export function usePlausible() {
  const trackEvent = useCallback((eventName: string, props?: Record<string, string | number>) => {
    if (typeof window !== 'undefined' && window.plausible) {
      window.plausible(eventName, props ? { props } : undefined);
    }
  }, []);

  // Specific funnel event handlers
  const trackDownload = useCallback((location: string, version?: string) => {
    trackEvent('Download Click', { 
      location, 
      version: version || 'latest',
      page: window.location.pathname 
    });
  }, [trackEvent]);

  const trackSignupStart = useCallback((source: string) => {
    trackEvent('Signup Start', { 
      source,
      page: window.location.pathname 
    });
  }, [trackEvent]);

  const trackCTAClick = useCallback((ctaName: string, location: string) => {
    trackEvent('CTA Click', { 
      cta_name: ctaName,
      location,
      page: window.location.pathname 
    });
  }, [trackEvent]);

  const trackFeatureView = useCallback((featureName: string) => {
    trackEvent('Feature View', { 
      feature: featureName,
      page: window.location.pathname 
    });
  }, [trackEvent]);

  const trackSectionView = useCallback((sectionName: string) => {
    trackEvent('Section View', { 
      section: sectionName,
      page: window.location.pathname 
    });
  }, [trackEvent]);

  const trackVideoPlay = useCallback((videoTitle: string) => {
    trackEvent('Video Play', { 
      video: videoTitle,
      page: window.location.pathname 
    });
  }, [trackEvent]);

  const trackDemoInteraction = useCallback((stepName: string, action?: string) => {
    trackEvent('Demo Interaction', { 
      step: stepName,
      action: action || 'view',
      page: window.location.pathname 
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