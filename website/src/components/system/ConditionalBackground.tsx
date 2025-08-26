'use client';

import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import dynamic from 'next/dynamic';

const InteractiveBackground = dynamic(() => import('@/components/landing/InteractiveBackground').then(mod => ({ default: mod.InteractiveBackground })), { ssr: false, loading: () => null });

export function ConditionalBackground() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  
  // Check if we're on a legal page (but don't return early to maintain hook order)
  const isLegalPage = pathname === '/privacy' || 
                      pathname === '/terms' || 
                      pathname.startsWith('/legal/');
  
  useEffect(() => {
    // Don't set up the idle callback if we're on a legal page
    if (isLegalPage) {
      return;
    }
    
    const rib = (window as any).requestIdleCallback || ((cb: Function) => setTimeout(cb, 800));
    const id = rib(() => setReady(true));
    return () => { 
      if ((window as any).cancelIdleCallback) {
        (window as any).cancelIdleCallback(id);
      }
    };
  }, [isLegalPage]);
  
  // Don't render particles on legal pages or before idle callback
  if (isLegalPage || !ready) {
    return null;
  }
  
  return (
    <Suspense fallback={null}>
      <ErrorBoundary fallback={null}>
        {ready ? <InteractiveBackground /> : null}
      </ErrorBoundary>
    </Suspense>
  );
}