// Presentational-only textarea component replicating desktop app styling for mobile demo
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface DesktopTextareaProps {
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  rows?: number;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSelect?: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void;
}

export const DesktopTextarea = React.forwardRef<HTMLTextAreaElement, DesktopTextareaProps>(
  ({
    placeholder,
    value,
    disabled = false,
    readOnly = false,
    className,
    rows = 4,
    onChange,
    onSelect,
  }, ref) => {
    return (
      <textarea
        ref={ref}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        rows={rows}
        onChange={onChange}
        onSelect={onSelect}
        className={cn(
          'min-h-[120px] w-full rounded-lg desktop-glass border border-primary/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40 hover:border-primary/30 disabled:opacity-50 placeholder:text-muted-foreground resize-none transition-all duration-200',
          className
        )}
      />
    );
  }
);

DesktopTextarea.displayName = 'DesktopTextarea';