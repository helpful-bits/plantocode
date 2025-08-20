/**
 * Presentational-only card components replicating desktop app styling for mobile demo.
 * These components are purely visual and non-functional - designed to show UI patterns without interaction.
 * All components include proper ARIA attributes and semantic structure for accessibility compliance.
 */
'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export interface DesktopCardProps {
  children: ReactNode;
  className?: string;
  /** Whether this card is presentational (default: true for demo) */
  'aria-hidden'?: boolean;
  /** Role override for semantic meaning */
  role?: string;
}

export interface DesktopCardHeaderProps {
  children: ReactNode;
  className?: string;
  /** Whether this header is presentational */
  'aria-hidden'?: boolean;
}

export interface DesktopCardTitleProps {
  children: ReactNode;
  className?: string;
  /** Whether this title is presentational */
  'aria-hidden'?: boolean;
}

export interface DesktopCardDescriptionProps {
  children: ReactNode;
  className?: string;
  /** Whether this description is presentational */
  'aria-hidden'?: boolean;
}

export interface DesktopCardContentProps {
  children: ReactNode;
  className?: string;
  /** Whether this content is presentational */
  'aria-hidden'?: boolean;
}

export interface DesktopCardFooterProps {
  children: ReactNode;
  className?: string;
  /** Whether this footer is presentational */
  'aria-hidden'?: boolean;
}

export function DesktopCard({ 
  children, 
  className, 
  'aria-hidden': ariaHidden = true,
  role = ariaHidden ? 'presentation' : undefined 
}: DesktopCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-card text-card-foreground shadow-soft hover:shadow-soft-md transition-all duration-300',
        className
      )}
      aria-hidden={ariaHidden}
      role={role}
    >
      {children}
    </div>
  );
}

export function DesktopCardHeader({ 
  children, 
  className,
  'aria-hidden': ariaHidden = true 
}: DesktopCardHeaderProps) {
  return (
    <div 
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      aria-hidden={ariaHidden}
      role={ariaHidden ? 'presentation' : undefined}
    >
      {children}
    </div>
  );
}

export function DesktopCardTitle({ 
  children, 
  className,
  'aria-hidden': ariaHidden = true 
}: DesktopCardTitleProps) {
  return (
    <h3 
      className={cn('font-semibold leading-none tracking-tight', className)}
      aria-hidden={ariaHidden}
      role={ariaHidden ? 'presentation' : undefined}
    >
      {children}
    </h3>
  );
}

export function DesktopCardDescription({ 
  children, 
  className,
  'aria-hidden': ariaHidden = true 
}: DesktopCardDescriptionProps) {
  return (
    <p 
      className={cn('text-sm text-muted-foreground', className)}
      aria-hidden={ariaHidden}
      role={ariaHidden ? 'presentation' : undefined}
    >
      {children}
    </p>
  );
}

export function DesktopCardContent({ 
  children, 
  className,
  'aria-hidden': ariaHidden = true 
}: DesktopCardContentProps) {
  return (
    <div 
      className={cn('p-6 pt-0', className)}
      aria-hidden={ariaHidden}
      role={ariaHidden ? 'presentation' : undefined}
    >
      {children}
    </div>
  );
}

export function DesktopCardFooter({ 
  children, 
  className,
  'aria-hidden': ariaHidden = true 
}: DesktopCardFooterProps) {
  return (
    <div 
      className={cn('flex items-center p-6 pt-0', className)}
      aria-hidden={ariaHidden}
      role={ariaHidden ? 'presentation' : undefined}
    >
      {children}
    </div>
  );
}