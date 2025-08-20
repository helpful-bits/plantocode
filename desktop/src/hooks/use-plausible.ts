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

  return { trackEvent };
}