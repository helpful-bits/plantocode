// Presentational-only progress component replicating desktop app styling for mobile demo
'use client';

import { cn } from '@/lib/utils';

export interface DesktopProgressProps {
  value?: number;
  max?: number;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

const progressVariants = {
  default: 'bg-primary',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
};

export function DesktopProgress({
  value,
  max = 100,
  className,
  variant = 'default',
}: DesktopProgressProps) {
  // Handle undefined value with indeterminate animation
  const percentage = value !== undefined ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;

  return (
    <div
      className={cn(
        'relative h-4 w-full overflow-hidden rounded-full bg-secondary/60 backdrop-blur-sm border border-border/30',
        className
      )}
    >
      <div
        className={cn(
          'h-full w-full flex-1 transition-all duration-300 ease-in-out',
          progressVariants[variant],
          value === undefined && 'animate-pulse opacity-60'
        )}
        style={{
          width: value !== undefined 
            ? `${percentage}%` 
            : '50%', // Show partial progress for indeterminate
        }}
      />
    </div>
  );
}