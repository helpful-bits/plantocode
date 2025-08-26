// Plausible analytics utilities for funnel tracking

declare global {
  interface Window {
    plausible: (event: string, options?: { props?: Record<string, string | number> }) => void;
    twq: (action: string, pixelId?: string, parameters?: Record<string, any>) => void;
  }
}

export const trackPlausibleEvent = (eventName: string, props?: Record<string, string | number>) => {
  if (typeof window !== 'undefined' && window.plausible) {
    window.plausible(eventName, props ? { props } : undefined);
  }
};

// Scroll depth tracking
export const trackScrollDepth = (): (() => void) | undefined => {
  if (typeof window === 'undefined') return undefined;

  let maxScroll = 0;
  const milestones = [25, 50, 75, 100];
  const trackedMilestones = new Set<number>();

  const handleScroll = () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = Math.round((scrollTop / docHeight) * 100);

    if (scrollPercent > maxScroll) {
      maxScroll = scrollPercent;
      
      milestones.forEach(milestone => {
        if (scrollPercent >= milestone && !trackedMilestones.has(milestone)) {
          trackedMilestones.add(milestone);
          trackPlausibleEvent('Scroll Depth', { 
            percentage: milestone,
            page: window.location.pathname 
          });
        }
      });
    }
  };

  const throttledScroll = throttle(handleScroll, 250);
  window.addEventListener('scroll', throttledScroll, { passive: true });

  return () => {
    window.removeEventListener('scroll', throttledScroll);
  };
};

// CTA and conversion events
export const trackCTAClick = (ctaName: string, location: string) => {
  trackPlausibleEvent('CTA Click', { 
    cta_name: ctaName,
    location,
    page: typeof window !== 'undefined' ? window.location.pathname : ''
  });
};

export const trackDownloadClick = (downloadType: string = 'desktop-app') => {
  trackPlausibleEvent('Download Click', { 
    download_type: downloadType,
    page: typeof window !== 'undefined' ? window.location.pathname : ''
  });
};

// X.com (Twitter) conversion tracking
export const trackXDownloadConversion = (location: string, version: string = '1.0.17') => {
  if (typeof window !== 'undefined' && window.twq) {
    try {
      window.twq('event', 'tw-qd2ik-qd2io', {
        contents: [{
          content_id: `vibe-manager-mac-${version}`,
          content_name: 'Vibe Manager Mac App',
          content_type: 'Software',
          content_category: 'Desktop Application',
          num_items: 1
        }],
        event_label: location,
        source_url: window.location.href,
        conversion_id: `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });
    } catch (error) {
      console.warn('X.com conversion tracking error:', error);
    }
  }
};

export const trackSignupStart = (source: string) => {
  trackPlausibleEvent('Signup Start', { 
    source,
    page: typeof window !== 'undefined' ? window.location.pathname : ''
  });
};

export const trackFeatureView = (featureName: string) => {
  trackPlausibleEvent('Feature View', { 
    feature: featureName,
    page: typeof window !== 'undefined' ? window.location.pathname : ''
  });
};

export const trackSectionView = (sectionName: string) => {
  trackPlausibleEvent('Section View', { 
    section: sectionName,
    page: typeof window !== 'undefined' ? window.location.pathname : ''
  });
};

export const trackVideoPlay = (videoTitle: string) => {
  trackPlausibleEvent('Video Play', { 
    video: videoTitle,
    page: typeof window !== 'undefined' ? window.location.pathname : ''
  });
};

export const trackDemoInteraction = (stepName: string) => {
  trackPlausibleEvent('Demo Interaction', { 
    step: stepName,
    page: typeof window !== 'undefined' ? window.location.pathname : ''
  });
};

// Utility function for throttling
function throttle<T extends (...args: any[]) => void>(func: T, limit: number): T {
  let inThrottle: boolean;
  return function(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  } as T;
}

// Intersection Observer for section tracking
export const trackSectionVisibility = (sectionId: string, threshold: number = 0.5): IntersectionObserver | undefined => {
  if (typeof window === 'undefined' || !window.IntersectionObserver) return undefined;

  const element = document.getElementById(sectionId);
  if (!element) return undefined;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          trackSectionView(sectionId);
          observer.unobserve(element);
        }
      });
    },
    { threshold }
  );

  observer.observe(element);
  return observer;
};