'use client';

import type { ReactNode } from 'react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { ThemeProvider } from './ThemeProvider';
import { SmoothScroll } from './SmoothScroll';
import { useLenisLifecycle } from '@/hooks/useLenisLifecycle';

interface ClientProvidersProps {
  children: ReactNode;
}

// Component to manage Lenis lifecycle
function LenisLifecycleManager() {
  useLenisLifecycle();
  return null;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <ThemeProvider>
      <LazyMotion features={domAnimation}>
        <SmoothScroll>
          <LenisLifecycleManager />
          {children}
        </SmoothScroll>
      </LazyMotion>
    </ThemeProvider>
  );
}