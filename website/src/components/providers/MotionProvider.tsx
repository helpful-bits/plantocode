'use client';

import type { ReactNode } from 'react';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';

interface MotionProviderProps {
  children: ReactNode;
}

export default function MotionProvider({ children }: MotionProviderProps) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig 
        reducedMotion="user"
        transition={{
          ease: [0.25, 0.46, 0.45, 0.94],
          duration: 0.5
        }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}