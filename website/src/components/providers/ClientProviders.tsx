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

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <ConsentProvider>
      <WebAuthProvider>
        <ThemeProvider>
          <MotionProvider>
            <SmoothScroll>
              <PerformanceSignalsManager />
              <LenisLifecycleManager />
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