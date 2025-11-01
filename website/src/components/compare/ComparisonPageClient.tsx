/**
 * ComparisonPageClient - Client-side wrapper for comparison pages with tracking
 */
'use client';

import { ReactNode } from 'react';
import { useScrollTracking } from '@/hooks/useScrollTracking';
import { trackCTA } from '@/lib/track';

interface ComparisonPageClientProps {
  children: ReactNode;
}

export function ComparisonPageClient({ children }: ComparisonPageClientProps) {
  // Track scroll depth on comparison pages
  useScrollTracking({ enabled: true });

  // Add click tracking to comparison CTAs
  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a[href="/downloads"], a[href="/demo"]');

    if (link) {
      const href = link.getAttribute('href');
      const text = link.textContent?.trim() || '';

      if (href === '/downloads' || href === '/demo') {
        trackCTA('comparison', text, href);
      }
    }
  };

  // Set up global click listener for comparison CTAs
  if (typeof window !== 'undefined') {
    window.addEventListener('click', handleClick as any);
  }

  return <>{children}</>;
}
