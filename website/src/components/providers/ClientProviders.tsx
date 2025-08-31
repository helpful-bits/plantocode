'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { SmoothScroll } from './SmoothScroll';
import { ConsentProvider } from './ConsentProvider';
import MotionProvider from '@/components/providers/MotionProvider';
import { CookieConsentBanner } from '@/components/system/CookieConsentBanner';
import { ConditionalAnalytics } from '@/components/system/ConditionalAnalytics';
import { ConditionalVercelAnalytics } from '@/components/system/ConditionalVercelAnalytics';
import { WebAuthProvider } from '@/components/auth/WebAuthProvider';
import { useLenisLifecycle } from '@/hooks/useLenisLifecycle';
import { usePerformanceSignals } from '@/hooks/usePerformanceSignals';
import { trackScroll, trackPageview } from '@/lib/track';
import { useEffect, useRef } from 'react';

interface ClientProvidersProps {
  children: ReactNode;
}

// Component to manage Lenis lifecycle
function LenisLifecycleManager() {
  useLenisLifecycle();
  return null;
}

// Component to manage performance signals
function PerformanceSignalsManager() {
  usePerformanceSignals();
  return null;
}

// Component to manage analytics tracking
function AnalyticsManager() {
  const maxScrollRef = useRef(0);
  const trackedMilestonesRef = useRef(new Set<number>());
  
  // Track pageview on mount
  useEffect(() => {
    // Track initial pageview with enhanced data (screen width, referrer, etc.)
    trackPageview();
  }, []);
  
  useEffect(() => {
    const milestones = [25, 50, 75, 100];
    
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = Math.round((scrollTop / docHeight) * 100);

      if (scrollPercent > maxScrollRef.current) {
        maxScrollRef.current = scrollPercent;
        
        milestones.forEach(milestone => {
          if (scrollPercent >= milestone && !trackedMilestonesRef.current.has(milestone)) {
            trackedMilestonesRef.current.add(milestone);
            trackScroll(milestone);
          }
        });
      }
    };

    // Throttle function
    let throttleTimer: NodeJS.Timeout | null = null;
    const throttledScroll = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        handleScroll();
        throttleTimer = null;
      }, 250);
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });
    return () => window.removeEventListener('scroll', throttledScroll);
  }, []);
  
  return null;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <ConsentProvider>
      <WebAuthProvider>
        <ThemeProvider>
          <MotionProvider>
            <SmoothScroll>
              <PerformanceSignalsManager />
              <LenisLifecycleManager />
              <AnalyticsManager />
              <ConditionalAnalytics />
              <ConditionalVercelAnalytics />
              {children}
              <CookieConsentBanner />
            </SmoothScroll>
          </MotionProvider>
        </ThemeProvider>
      </WebAuthProvider>
    </ConsentProvider>
  );
}