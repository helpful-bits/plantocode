// Plausible analytics utilities for funnel tracking

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
    twq: (action: string, pixelId?: string, parameters?: Record<string, any>) => void;
  }
}

export const trackPlausibleEvent = (
  eventName: string, 
  props?: Record<string, string | number | boolean>,
  options?: {
    callback?: () => void;
    interactive?: boolean;
    revenue?: { currency: string; amount: number | string };
    u?: string;
  }
) => {
  if (typeof window !== 'undefined' && window.plausible) {
    const plausibleOptions: any = {};
    if (props) plausibleOptions.props = props;
    if (options?.callback) plausibleOptions.callback = options.callback;
    if (options?.interactive !== undefined) plausibleOptions.interactive = options.interactive;
    if (options?.revenue) plausibleOptions.revenue = options.revenue;
    if (options?.u) plausibleOptions.u = options.u;
    
    window.plausible(eventName, Object.keys(plausibleOptions).length > 0 ? plausibleOptions : undefined);
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
            percentage: milestone
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
    location
  });
};

export const trackDownloadClick = (downloadType: string = 'desktop-app') => {
  trackPlausibleEvent('Download Click', { 
    download_type: downloadType
  });
};

// X.com (Twitter) conversion tracking
export const trackXDownloadConversion = (location: string, version: string = '1.0.17') => {
  if (typeof window !== 'undefined' && window.twq && process.env.NEXT_PUBLIC_X_PIXEL_ID) {
    try {
      // Download Tracker event from X Ads Manager
      const eventId = process.env.NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID || 'qd2io';
      const eventName = `tw-${process.env.NEXT_PUBLIC_X_PIXEL_ID}-${eventId}`;
      
      window.twq('event', eventName, {
        contents: [{
          content_id: `vibe-manager-mac-${version}`,
          content_name: 'Vibe Manager Mac App',
          content_type: 'Software',
          num_items: 1
        }],
        description: `Download from ${location}`,
        conversion_id: `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });
    } catch (error) {
      console.warn('X.com conversion tracking error:', error);
    }
  }
};

export const trackSignupStart = (source: string) => {
  trackPlausibleEvent('Signup Start', { 
    source
  });
};

export const trackFeatureView = (featureName: string) => {
  trackPlausibleEvent('Feature View', { 
    feature: featureName
  });
};

export const trackSectionView = (sectionName: string) => {
  trackPlausibleEvent('Section View', { 
    section: sectionName
  });
};

export const trackVideoPlay = (videoTitle: string) => {
  trackPlausibleEvent('Video Play', { 
    video: videoTitle
  });
};

export const trackDemoInteraction = (stepName: string) => {
  trackPlausibleEvent('Demo Interaction', { 
    step: stepName
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