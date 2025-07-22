'use client';

import { ParallaxProvider as Provider } from 'react-scroll-parallax';

export function ParallaxProvider({ children }: { children: React.ReactNode }) {
  return <Provider>{children}</Provider>;
}