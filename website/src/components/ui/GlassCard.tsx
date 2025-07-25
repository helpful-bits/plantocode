'use client';

import type { HTMLAttributes } from 'react';
import { forwardRef, memo } from 'react';
import { cn } from '@/lib/utils';

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  highlighted?: boolean;
}

const GlassCardComponent = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, highlighted = false, children, ...props }, ref) => {
    const glassClass = highlighted ? 'glass-highlighted' : 'glass';

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-2xl p-6 overflow-hidden transition-all duration-300',
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

GlassCardComponent.displayName = 'GlassCard';

// Memoize the component to prevent unnecessary re-renders
export const GlassCard = memo(GlassCardComponent);

export default GlassCard;