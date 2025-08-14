'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// Lazy load the InteractiveBackground component
const InteractiveBackground = dynamic(
  () => import('./InteractiveBackground').then(mod => ({ default: mod.InteractiveBackground })),
  { 
    ssr: false,
    loading: () => <div className="fixed inset-0 bg-background" />
  }
);

interface LazyInteractiveBackgroundProps {
  className?: string;
}

export function LazyInteractiveBackground({ className = '' }: LazyInteractiveBackgroundProps) {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-background" />}>
      <InteractiveBackground className={className} />
    </Suspense>
  );
}