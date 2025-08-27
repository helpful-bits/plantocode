// Plausible analytics utilities - core functions used by hooks/useAnalytics.ts

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
          trackPlausibleEvent('scroll_depth', { 
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

// Internal helper for section visibility tracking
const trackSectionView = (sectionName: string) => {
  trackPlausibleEvent('Section View', { 
    section: sectionName
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