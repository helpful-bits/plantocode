/**
 * Presentational-only button component replicating desktop app styling for mobile demo.
 * This component is purely visual and non-functional - designed to show UI patterns without interaction.
 * All interactive elements include proper ARIA attributes for accessibility compliance.
 */
'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export interface DesktopButtonProps {
  children: ReactNode;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'filter' | 'filter-active';
  size?: 'sm' | 'md' | 'lg' | 'xs';
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  /** Accessibility label for screen readers */
  'aria-label'?: string;
  /** ID of element that describes this button */
  'aria-describedby'?: string;
  /** Whether this is a presentational element (default: true for demo) */
  'aria-hidden'?: boolean;
  title?: string;
}

const buttonVariants = {
  default: 'desktop-glass bg-primary/90 border border-primary/30 text-primary-foreground hover:bg-primary hover:border-primary/40 hover:scale-[1.02]',
  outline: 'border-2 border-primary/70 bg-background/90 text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/90 shadow-sm backdrop-blur-sm',
  ghost: 'text-foreground hover:bg-accent/40 hover:text-accent-foreground backdrop-blur-sm border border-transparent hover:border-accent/50',
  secondary: 'desktop-glass bg-secondary/80 border border-secondary/40 text-secondary-foreground hover:bg-secondary hover:border-secondary/60',
  destructive: 'desktop-glass bg-destructive/90 border border-destructive/30 text-destructive-foreground hover:bg-destructive hover:border-destructive/40',
  filter: 'border-0 rounded-none text-muted-foreground hover:bg-accent/30 hover:text-accent-foreground transition-all duration-200 backdrop-blur-sm',
  'filter-active': 'border-0 rounded-none bg-primary/10 text-primary font-medium hover:bg-primary/15 transition-all duration-200 backdrop-blur-sm',
};

const buttonSizes = {
  xs: 'h-6 rounded px-2 text-xs',
  sm: 'h-8 rounded-lg px-3 text-xs',
  md: 'h-9 px-4 py-2',
  lg: 'h-10 rounded-lg px-8',
};

export function DesktopButton({
  children,
  variant = 'default',
  size = 'md',
  isLoading = false,
  disabled = false,
  className,
  onClick,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-hidden': ariaHidden = true, // Default to hidden for demo elements
  title,
}: DesktopButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        // Ensure minimum touch target size for mobile, but not for filter variants
        variant !== 'filter' && variant !== 'filter-active' && 'min-h-[44px] min-w-[44px]',
        className
      )}
      disabled={disabled || isLoading}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-hidden={ariaHidden}
      title={title}
      // Mark as presentational if no click handler and aria-hidden
      role={!onClick && ariaHidden ? 'presentation' : undefined}
      tabIndex={ariaHidden ? -1 : undefined}
    >
      {isLoading && (
        <div 
          className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
          role="presentation"
        />
      )}
      {children}
    </button>
  );
}