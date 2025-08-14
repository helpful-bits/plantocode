'use client';

import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import dynamic from 'next/dynamic';

// Ultra-lazy load the 3D background - only when truly needed
const LazyInteractiveBackground = dynamic(
  () => import('@/components/landing/LazyInteractiveBackground').then(mod => ({ default: mod.LazyInteractiveBackground })),
  {
    ssr: false,
    loading: () => null
  }
);

export function ConditionalBackground() {
  const pathname = usePathname();
  const [shouldRender, setShouldRender] = useState(false);
  
  // Don't render particles on legal pages (including regional legal pages and redirect routes)
  if (pathname === '/privacy' || 
      pathname === '/terms' || 
      pathname.startsWith('/legal/')) {
    return null;
  }
  
  useEffect(() => {
    // Defer loading the 3D background until after critical content
    if ('requestIdleCallback' in window) {
      const handle = (window as any).requestIdleCallback(() => {
        setShouldRender(true);
      }, { timeout: 2000 });
      
      return () => {
        if ('cancelIdleCallback' in window) {
          (window as any).cancelIdleCallback(handle);
        }
      };
    } else {
      const timer = setTimeout(() => {
        setShouldRender(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, []);
  
  if (!shouldRender) {
    return null;
  }
  
  return (
    <Suspense fallback={null}>
      <ErrorBoundary fallback={null}>
        <LazyInteractiveBackground />
      </ErrorBoundary>
    </Suspense>
  );
}