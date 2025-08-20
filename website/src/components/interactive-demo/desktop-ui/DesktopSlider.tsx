// Presentational-only slider component replicating desktop app styling for mobile demo
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface DesktopSliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  id?: string;
  onChange?: (value: number) => void;
}

export function DesktopSlider({
  value,
  min = 0,
  max = 100,
  step: _step = 1,
  disabled = false,
  className,
  onChange,
  ...rest
}: DesktopSliderProps) {
  // Controlled, presentational component - purely visual representation
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !onChange) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const newPercentage = (clickX / rect.width) * 100;
    const newValue = min + (newPercentage / 100) * (max - min);
    
    onChange(Math.max(min, Math.min(max, newValue)));
  };

  return (
    <div 
      className={cn('relative flex w-full touch-none select-none items-center py-3', className)}
      {...rest}
    >
      <div 
        className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary/80 border border-border/30 cursor-pointer"
        onClick={handleClick}
      >
        <div
          className="absolute h-full bg-primary shadow-soft transition-all duration-200 ease-in-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div
        className={cn(
          "absolute h-5 w-5 rounded-full border-2 border-primary bg-background shadow-soft transition-colors transition-shadow duration-200 focus:outline-none",
          disabled ? "pointer-events-none opacity-50" : "hover:bg-accent/30 hover:border-primary/80 hover:cursor-pointer"
        )}
        style={{ left: `calc(${percentage}% - 10px)` }}
      />
    </div>
  );
}