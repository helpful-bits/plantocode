// Presentational-only dialog components replicating desktop app styling for mobile demo
'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export interface DesktopDialogProps {
  children: ReactNode;
  open?: boolean;
  className?: string;
}

export interface DesktopDialogOverlayProps {
  className?: string;
}

export interface DesktopDialogHeaderProps {
  children: ReactNode;
  className?: string;
}

export interface DesktopDialogTitleProps {
  children: ReactNode;
  className?: string;
}

export interface DesktopDialogDescriptionProps {
  children: ReactNode;
  className?: string;
}

export interface DesktopDialogContentProps {
  children: ReactNode;
  className?: string;
}

export interface DesktopDialogFooterProps {
  children: ReactNode;
  className?: string;
}

export function DesktopDialog({ children, open = true, className }: DesktopDialogProps) {
  return (
    <div 
      className={cn('fixed inset-0 z-[100] flex items-center justify-center', className)}
      style={{ display: open ? 'flex' : 'none' }}
    >
      <DesktopDialogOverlay />
      {children}
    </div>
  );
}

export function DesktopDialogOverlay({ className }: DesktopDialogOverlayProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm',
        className
      )}
    />
  );
}

export function DesktopDialogContent({ children, className }: DesktopDialogContentProps) {
  return (
    <div
      className={cn(
        'fixed left-[50%] top-[50%] z-[200] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 bg-card border border-border/60 shadow-soft-md desktop-glass-card p-6 duration-200 sm:rounded-lg',
        className
      )}
    >
      {children}
    </div>
  );
}

export function DesktopDialogHeader({ children, className }: DesktopDialogHeaderProps) {
  return (
    <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}>
      {children}
    </div>
  );
}

export function DesktopDialogTitle({ children, className }: DesktopDialogTitleProps) {
  return (
    <h3 className={cn('text-lg font-semibold leading-none tracking-tight', className)}>
      {children}
    </h3>
  );
}

export function DesktopDialogDescription({ children, className }: DesktopDialogDescriptionProps) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      {children}
    </p>
  );
}


export function DesktopDialogFooter({ children, className }: DesktopDialogFooterProps) {
  return (
    <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}>
      {children}
    </div>
  );
}