'use client';

import { useState } from 'react';
import { DocsSidebarDrawer } from './DocsSidebarDrawer';
import SearchButton from './SearchButton';
import { TableOfContents } from './TableOfContents';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocsLayoutClientProps {
  currentPath: string;
}

export function DocsLayoutClient({ currentPath }: DocsLayoutClientProps) {
  const [tocOpen, setTocOpen] = useState(false);

  return (
    <>
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-16 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-2 px-4 py-3">
          <DocsSidebarDrawer currentPath={currentPath} />

          {/* On this page dropdown */}
          <div className="relative flex-1">
            <button
              onClick={() => setTocOpen(!tocOpen)}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
              aria-expanded={tocOpen}
              aria-label="Table of contents"
            >
              <span className="text-muted-foreground">On this page</span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform",
                  tocOpen && "rotate-180"
                )}
              />
            </button>

            {/* Dropdown content */}
            {tocOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 max-h-64 overflow-y-auto glass rounded-lg shadow-xl border border-border/50 p-4">
                <TableOfContents />
              </div>
            )}
          </div>

          <SearchButton type="mobile" />
        </div>
      </div>

      {/* Overlay when TOC is open */}
      {tocOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/20 z-30"
          onClick={() => setTocOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}