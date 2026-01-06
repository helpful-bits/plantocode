'use client';

import { usePathname } from '@/i18n/navigation';
import { SidebarNavServer } from './SidebarNavServer';
import { Breadcrumbs } from './Breadcrumbs';
import { TableOfContents } from './TableOfContents';
import { DocsLayoutClient } from './DocsLayoutClient';
import { useTranslations } from 'next-intl';

interface DocsLayoutWrapperProps {
  children: React.ReactNode;
}

export function DocsLayoutWrapper({ children }: DocsLayoutWrapperProps) {
  const pathname = usePathname();
  const t = useTranslations('docs');

  return (
    <>
      {/* Fixed Left Sidebar */}
      <aside 
        className="hidden md:block fixed left-0 top-16 w-64 xl:w-72 h-[calc(100vh-4rem)] bg-background/95 backdrop-blur-sm border-r border-border/50 z-10 overflow-y-auto" 
        aria-label="Documentation" 
        data-pagefind-ignore="all"
      >
        <div className="pr-4 py-6">
          <SidebarNavServer currentPath={pathname} />
        </div>
      </aside>

      {/* Fixed Right TOC - hidden on mobile and tablet, visible on desktop */}
      <aside 
        className="hidden xl:block fixed right-0 top-16 w-64 h-[calc(100vh-4rem)] bg-background/95 backdrop-blur-sm border-l border-border/50 z-10 overflow-y-auto" 
        aria-label="Table of contents"
      >
        <div className="px-4 py-6">
          <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
            {t('onThisPage.title')}
          </h2>
          <TableOfContents />
        </div>
      </aside>

      {/* Main content with proper margins */}
      <div className="pt-28 md:pt-16 md:ml-64 xl:ml-72 xl:mr-64 flex justify-center">
        <div className="px-4 sm:px-6 lg:px-8 pb-6 w-full max-w-5xl">
          {/* Client-side components for mobile functionality */}
          <DocsLayoutClient currentPath={pathname} />

          <Breadcrumbs currentPath={pathname} />
          
          <main id="main-content" tabIndex={-1}>
            <div id="doc-content">
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}