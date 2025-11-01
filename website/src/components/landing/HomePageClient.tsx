/**
 * HomePageClient - Client-side wrapper for homepage with scroll tracking
 */
'use client';

import { ReactNode } from 'react';
import { useScrollTracking } from '@/hooks/useScrollTracking';

interface HomePageClientProps {
  children: ReactNode;
}

export function HomePageClient({ children }: HomePageClientProps) {
  // Track scroll depth on homepage
  useScrollTracking({ enabled: true });

  return <>{children}</>;
}
