'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { SmoothScroll } from './SmoothScroll';
import MotionProvider from '@/components/providers/MotionProvider';
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
    <ThemeProvider>
      <MotionProvider>
        <SmoothScroll>
          <PerformanceSignalsManager />
          <LenisLifecycleManager />
          {children}
        </SmoothScroll>
      </MotionProvider>
    </ThemeProvider>
  );
}