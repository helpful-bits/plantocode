'use client';

import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  highlighted?: boolean;
}

const GlassCardComponent = forwardRef<HTMLDivElement, GlassCardProps & { whileHover?: any; transition?: any }>(
  ({ className, highlighted = false, children, whileHover, transition, ...props }, ref) => {
    const glassClass = highlighted ? 'glass-highlighted' : 'glass';

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-2xl p-6 overflow-hidden',
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

export const GlassCard = motion(GlassCardComponent);

export default GlassCard;