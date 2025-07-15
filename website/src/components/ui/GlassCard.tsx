'use client';

import { forwardRef, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(className)}
        {...props}
      />
    );
  }
);

GlassCard.displayName = 'GlassCard';

export default GlassCard;