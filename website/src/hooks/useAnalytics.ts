'use client';

import { useEffect, useRef } from 'react';
import { trackScrollDepth, trackSectionVisibility, trackPlausibleEvent } from '@/lib/analytics';

export const useScrollTracking = () => {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const cleanup = trackScrollDepth();
    cleanupRef.current = cleanup || null;
    
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);
};

export const useSectionTracking = (sectionId: string, threshold?: number) => {
  useEffect(() => {
    const observer = trackSectionVisibility(sectionId, threshold);
    
    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [sectionId, threshold]);
};

export const usePageView = (pageName?: string) => {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const page = pageName || window.location.pathname;
      trackPlausibleEvent('Page View', { 
        page,
        referrer: document.referrer || 'direct'
      });
    }
  }, [pageName]);
};