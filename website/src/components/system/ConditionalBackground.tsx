'use client';

import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';

// Import the 3D background directly to bypass webpack module issues  
import { LazyInteractiveBackground } from '@/components/landing/LazyInteractiveBackground';

export function ConditionalBackground() {
  const pathname = usePathname();
  const [shouldRender, setShouldRender] = useState(false);
  
  // Check if we're on a legal page (but don't return early to maintain hook order)
  const isLegalPage = pathname === '/privacy' || 
                      pathname === '/terms' || 
                      pathname.startsWith('/legal/');
  
  useEffect(() => {
    // Don't set up the idle callback if we're on a legal page
    if (isLegalPage) {
      return;
    }
    
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
  }, [isLegalPage]);
  
  // Don't render particles on legal pages or before idle callback
  if (isLegalPage || !shouldRender) {
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