'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { SmoothScroll } from './SmoothScroll';
import MotionProvider from '@/components/providers/MotionProvider';
import { WebAuthProvider } from '@/components/auth/WebAuthProvider';
import { useLenisLifecycle } from '@/hooks/useLenisLifecycle';
import { usePerformanceSignals } from '@/hooks/usePerformanceSignals';
import PlausibleProvider from 'next-plausible';

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
  // Plausible is cookie-free and GDPR compliant by default
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || 'vibemanager.app';
  
  return (
    <PlausibleProvider 
      domain={plausibleDomain}
      trackOutboundLinks={true}
      trackFileDownloads={true}
      taggedEvents={true}
      hash={true}
      pageviewProps={{
        author: 'vibe-manager',
        section: 'website'
      }}
    >
      <WebAuthProvider>
        <ThemeProvider>
          <MotionProvider>
            <SmoothScroll>
              <PerformanceSignalsManager />
              <LenisLifecycleManager />
              {children}
            </SmoothScroll>
          </MotionProvider>
        </ThemeProvider>
      </WebAuthProvider>
    </PlausibleProvider>
  );
}