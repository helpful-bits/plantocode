'use client';

import { forwardRef, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  highlighted?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, highlighted = false, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("relative group", className)} {...props}>
        <div className={cn(
          "relative h-full overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl",
          highlighted && "scale-105"
        )}>
          {/* Solid base layer for consistent readability */}
          <div className="absolute inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-xl backdrop-saturate-150" />
          
          {/* Subtle gradient overlay for depth */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 dark:from-white/5 via-transparent to-transparent opacity-50" />
          
          {/* Tint layer */}
          <div className={cn(
            "absolute inset-0",
            highlighted 
              ? "bg-gradient-to-b from-emerald-500/10 to-teal-500/10 dark:from-emerald-400/5 dark:to-teal-400/5"
              : "bg-gradient-to-b from-transparent to-emerald-500/5 dark:to-blue-400/5"
          )} />
          
          {/* Glass shine effect */}
          <div className="absolute inset-[1px] bg-gradient-to-br from-white/30 dark:from-white/10 via-transparent to-transparent rounded-[22px] opacity-30" />
          
          {/* Shimmer on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-20 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent -skew-x-12 transition-all duration-700" />
          
          {/* Subtle edge highlights */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/20 to-transparent" />
          
          {/* Clean border */}
          <div className={cn(
            "absolute inset-0 rounded-2xl ring-1",
            highlighted 
              ? "ring-emerald-500/40 dark:ring-emerald-400/30"
              : "ring-white/20 dark:ring-white/10"
          )} />
          
          {/* Content container */}
          <div className="relative h-full flex flex-col">
            {children}
          </div>
        </div>
      </div>
    );
  }
);

GlassCard.displayName = 'GlassCard';

export default GlassCard;