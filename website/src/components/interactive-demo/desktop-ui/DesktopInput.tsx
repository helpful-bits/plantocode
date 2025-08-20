// Presentational-only input component replicating desktop app styling for mobile demo
'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export interface DesktopInputProps {
  value?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'password' | 'search';
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
  onChange?: (value: string) => void;
}

export function DesktopInput({
  value,
  placeholder,
  type = 'text',
  disabled = false,
  className,
  icon,
  onChange,
}: DesktopInputProps) {
  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </div>
      )}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          'flex h-10 w-full rounded-lg desktop-glass border border-primary/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40 hover:border-primary/30 disabled:opacity-50 placeholder:text-muted-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium transition-all duration-200',
          icon && 'pl-9',
          className
        )}
      />
    </div>
  );
}