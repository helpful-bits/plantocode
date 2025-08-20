// Presentational-only tooltip component replicating desktop app styling for mobile demo
'use client';

import { cn } from '@/lib/utils';
import { ReactNode, useState } from 'react';

export interface DesktopTooltipProps {
  children: ReactNode;
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export function DesktopTooltip({
  children,
  content,
  side = 'top',
  className,
}: DesktopTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  };

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className={cn(
            'absolute z-50 overflow-hidden rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-soft-md backdrop-blur-sm border border-primary/20 animate-in fade-in-0 zoom-in-96',
            sideClasses[side],
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}