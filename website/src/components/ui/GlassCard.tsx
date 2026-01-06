'use client';

import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  highlighted?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, highlighted = false, children, ...props }, ref) => {
    const glassClass = highlighted ? 'glass-highlighted' : 'glass';
    const paddingRegex = /(?:^|\s)!?(p|px|py|pt|pr|pb|pl)-\d+/;
    const hasCustomPadding = typeof className === 'string' && paddingRegex.test(className);

    return (
      <div
        ref={ref}
        className={cn(
          'relative z-10 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm',
          !hasCustomPadding && 'p-6',
          glassClass,
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

GlassCard.displayName = 'GlassCard';

export default GlassCard;