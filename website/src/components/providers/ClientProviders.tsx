'use client';

import { ThemeProvider } from './ThemeProvider';
import { ParallaxProvider } from 'react-scroll-parallax';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ParallaxProvider>
        {children}
      </ParallaxProvider>
    </ThemeProvider>
  );
}