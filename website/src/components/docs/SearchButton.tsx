'use client';

import {useEffect, useState} from 'react';
import {Search} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {SearchDialog} from './SearchDialog';

type SearchButtonProps = {
  type?: 'desktop' | 'mobile';
  className?: string;
};

export default function SearchButton({ type = 'desktop', className }: SearchButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Centralized Cmd/Ctrl + K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const isDesktop = type === 'desktop';

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        variant={isDesktop ? 'outline' : 'outline'}
        size={isDesktop ? 'sm' : 'compact'}
        className={[
          isDesktop ? 'w-full justify-start px-4 mb-4' : 'px-2',
          'gap-2',
          className || ''
        ].join(' ')}
        aria-label="Search docs"
      >
        <Search className="h-4 w-4 opacity-80" />
        {isDesktop ? (
          <span className="flex-1 text-left text-sm text-muted-foreground">Search docs…</span>
        ) : (
          <span className="text-sm">Search</span>
        )}
        {isDesktop && (
          <kbd className="ml-auto hidden md:flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        )}
      </Button>

      <SearchDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}