'use client';

import dynamic from 'next/dynamic';

// Client-side only dynamic imports wrapped in client components
export const DatabaseErrorHandler = dynamic(
  () => import("./database-error"),
  { ssr: false }
);

// Add any other ssr: false dynamic imports here 