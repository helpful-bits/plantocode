'use client';

import dynamic from 'next/dynamic';

export const BackgroundJobsSidebar = dynamic(
  () => import("@/app/components/background-jobs-sidebar/background-jobs-sidebar").then(
    mod => ({ default: mod.BackgroundJobsSidebar })
  ), 
  { ssr: false }
);

export const Navigation = dynamic(
  () => import("@/app/components/navigation").then(
    mod => ({ default: mod.Navigation })
  ), 
  { ssr: false }
); 