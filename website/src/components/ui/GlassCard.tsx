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
    const hasCustomPadding = className?.match(/p[xy]?-|p[trbl]-/);

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-2xl overflow-hidden',
          !hasCustomPadding && 'p-6',
          glassClass,
          className,
        )}
        {...props}
      >
        <div className="relative z-10">
          {children}
        </div>
      </div>
    );
  },
);

GlassCard.displayName = 'GlassCard';

export default GlassCard;