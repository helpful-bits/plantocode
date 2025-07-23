'use client';

import dynamic from 'next/dynamic';

const InteractiveBackground = dynamic(() => import('@/components/landing/InteractiveBackground').then(mod => ({ default: mod.InteractiveBackground })), { ssr: false });

export function ClientWrapper() {
  return <InteractiveBackground />;
}