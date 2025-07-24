'use client';

import { ReactNode } from 'react';
import { ReactLenis } from 'lenis/react';

interface SmoothScrollProps {
  children: ReactNode;
}

export function SmoothScroll({ children }: SmoothScrollProps) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        duration: 1.2,
        wheelMultiplier: 1,
        touchMultiplier: 2,
        infinite: false
      }}
    >
      {children}
    </ReactLenis>
  );
}