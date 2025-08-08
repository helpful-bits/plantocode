'use client';

import type { ReactNode } from 'react';
import { ReactLenis } from 'lenis/react';

interface SmoothScrollProps {
  children: ReactNode;
}

export function SmoothScroll({ children }: SmoothScrollProps) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.08,
        duration: 1.0,
        wheelMultiplier: 0.95,
        touchMultiplier: 2,
        infinite: false,
      }}
    >
      {children}
    </ReactLenis>
  );
}