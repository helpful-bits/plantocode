// Presentational-only tabs component replicating desktop app styling for mobile demo
'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export interface DesktopTabsProps {
  children: ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export interface DesktopTabsListProps {
  children: ReactNode;
  className?: string;
}

export interface DesktopTabsTriggerProps {
  children: ReactNode;
  value: string;
  isActive?: boolean;
  className?: string;
  onClick?: () => void;
}

export interface DesktopTabsContentProps {
  children: ReactNode;
  value: string;
  isActive?: boolean;
  className?: string;
}

export function DesktopTabs({
  children,
  className,
}: Pick<DesktopTabsProps, 'children' | 'className'>) {
  return (
    <div className={cn('w-full', className)}>
      {children}
    </div>
  );
}

export function DesktopTabsList({ children, className }: DesktopTabsListProps) {
  return (
    <div
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-lg bg-muted/60 backdrop-blur-sm p-1 text-muted-foreground border border-border/30',
        className
      )}
    >
      {children}
    </div>
  );
}

export function DesktopTabsTrigger({
  children,
  isActive = false,
  className,
  onClick,
}: Omit<DesktopTabsTriggerProps, 'value'>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 focus:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        isActive
          ? 'bg-primary/10 text-primary border border-primary/20 shadow-soft backdrop-blur-sm'
          : 'text-muted-foreground hover:bg-muted/40',
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function DesktopTabsContent({
  children,
  isActive = true,
  className,
}: Omit<DesktopTabsContentProps, 'value'>) {
  return (
    <div
      className={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
      style={{ display: isActive ? 'block' : 'none' }}
    >
      {children}
    </div>
  );
}