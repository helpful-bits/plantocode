'use client';

import { usePathname } from 'next/navigation';
import { InteractiveBackground } from '@/components/landing/InteractiveBackground';
import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';

export function ConditionalBackground() {
  const pathname = usePathname();
  
  // Don't render particles on legal pages
  if (pathname === '/privacy' || pathname === '/terms') {
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