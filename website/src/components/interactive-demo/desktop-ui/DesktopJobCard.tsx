// Reusable job card component for background tasks sidebar - matches desktop styling
'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DesktopJobCardProps {
  children: ReactNode;
  className?: string;
}

export function DesktopJobCard({ 
  children, 
  className
}: DesktopJobCardProps) {
  return (
    <div 
      className={cn(
        "border rounded-xl bg-background p-4 shadow-sm w-full max-w-[370px] text-xs desktop-glass-card",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DesktopJobCardContent({ 
  children,
  className 
}: { 
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("", className)}>
      {children}
    </div>
  );
}