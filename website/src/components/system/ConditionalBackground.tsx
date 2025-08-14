'use client';

import { usePathname } from 'next/navigation';
import { LazyInteractiveBackground } from '@/components/landing/LazyInteractiveBackground';
import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';

export function ConditionalBackground() {
  const pathname = usePathname();
  
  // Don't render particles on legal pages (including regional legal pages and redirect routes)
  if (pathname === '/privacy' || 
      pathname === '/terms' || 
      pathname.startsWith('/legal/')) {
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