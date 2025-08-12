'use client';

import { usePathname } from 'next/navigation';
import { InteractiveBackground } from '@/components/landing/InteractiveBackground';
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
        <InteractiveBackground />
      </ErrorBoundary>
    </Suspense>
  );
}