// Presentational-only progress component replicating desktop app styling for mobile demo
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface DesktopProgressProps {
  value?: number;
  max?: number;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export const DesktopProgress = React.memo<DesktopProgressProps>(function DesktopProgress({
  value,
  max = 100,
  className,
  variant: _ = 'default', // Mark as intentionally unused
}) {
  // Handle undefined value with indeterminate animation
  // Round to 2 decimal places to avoid sub-pixel rendering issues
  const percentage = value !== undefined 
    ? Math.round(Math.min(Math.max((value / max) * 100, 0), 100) * 100) / 100 
    : 0;

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-secondary/60 backdrop-blur-sm border border-border/30',
        className || 'h-4' // Default height if no className provided
      )}
      style={{
        minHeight: '4px', // Ensure minimum height even with h-1
      }}
    >
      <div
        className={cn(
          'transition-none bg-teal-500', // Use Tailwind class for guaranteed color
          value === undefined && 'animate-pulse opacity-60'
        )}
        style={{
          width: value !== undefined 
            ? `${percentage}%` 
            : '50%',
          height: '100%', // Fill full container height
          borderRadius: 'inherit',
          willChange: 'width',
          transform: 'translateZ(0)',
          minHeight: '4px', // Ensure it's always visible
          // backgroundColor handled by bg-teal-500 class
        }}
      />
    </div>
  );
});