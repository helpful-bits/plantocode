// Presentational-only badge component replicating desktop app styling for mobile demo
'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export interface DesktopBadgeProps {
  children: ReactNode;
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';
  className?: string;
}

const badgeVariants = {
  default: 'desktop-glass border border-primary/30 bg-primary/20 text-primary-foreground shadow hover:bg-primary/30 hover:border-primary/40',
  secondary: 'desktop-glass border border-secondary/30 bg-secondary/20 text-secondary-foreground hover:bg-secondary/30 hover:border-secondary/40',
  outline: 'desktop-glass border border-primary/20 text-foreground hover:border-primary/30',
  success: 'desktop-glass border border-success/30 bg-success/20 text-success-foreground shadow hover:bg-success/30 hover:border-success/40',
  warning: 'desktop-glass border border-warning/30 bg-warning/20 text-warning-foreground shadow hover:bg-warning/30 hover:border-warning/40',
  destructive: 'desktop-glass border border-destructive/30 bg-destructive/20 text-destructive-foreground shadow hover:bg-destructive/30 hover:border-destructive/40',
};

export function DesktopBadge({
  children,
  variant = 'default',
  className,
}: DesktopBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        badgeVariants[variant],
        className
      )}
    >
      {children}
    </div>
  );
}