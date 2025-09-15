'use client';

import { usePathname } from 'next/navigation';
import { Footer } from '@/components/landing/Footer';

export function ConditionalFooter() {
  const pathname = usePathname();
  const isDocsPage = pathname.startsWith('/docs');

  // Don't show the main footer on docs pages
  if (isDocsPage) {
    return null;
  }

  return <Footer />;
}