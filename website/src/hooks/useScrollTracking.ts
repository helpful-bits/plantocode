/**
 * useScrollTracking - Track scroll depth milestones
 * Fires events at 25%, 50%, 75%, 90% scroll depths
 */
'use client';

import { useEffect, useRef } from 'react';
import { trackScroll } from '@/lib/track';

interface UseScrollTrackingOptions {
  enabled?: boolean;
  milestones?: number[]; // Default: [25, 50, 75, 90]
  throttleMs?: number; // Default: 100ms
}

export function useScrollTracking(options: UseScrollTrackingOptions = {}) {
  const {
    enabled = true,
    milestones = [25, 50, 75, 90],
    throttleMs = 100,
  } = options;

  const trackedMilestones = useRef<Set<number>>(new Set());
  const throttleTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const handleScroll = () => {
      // Throttle scroll events
      if (throttleTimeout.current) {
        return;
      }

      throttleTimeout.current = setTimeout(() => {
        throttleTimeout.current = null;

        // Calculate scroll percentage
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollableHeight = documentHeight - windowHeight;

        if (scrollableHeight <= 0) {
          return; // Not scrollable
        }

        const scrollPercentage = Math.round((scrollTop / scrollableHeight) * 100);

        // Check which milestones have been reached
        for (const milestone of milestones) {
          if (scrollPercentage >= milestone && !trackedMilestones.current.has(milestone)) {
            trackedMilestones.current.add(milestone);
            trackScroll(milestone);
          }
        }
      }, throttleMs);
    };

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Initial check in case page is already scrolled
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (throttleTimeout.current) {
        clearTimeout(throttleTimeout.current);
      }
    };
  }, [enabled, milestones, throttleMs]);

  // Return function to reset tracked milestones (useful for SPAs)
  const reset = () => {
    trackedMilestones.current.clear();
  };

  return { reset };
}
