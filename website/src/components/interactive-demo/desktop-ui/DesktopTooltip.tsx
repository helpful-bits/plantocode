// Desktop-compatible tooltip components replicating desktop app styling
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { ReactNode, useState, createContext, useContext } from 'react';

// Original tooltip component
export interface DesktopTooltipProps {
  children: ReactNode;
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export function DesktopTooltip({
  children,
  content,
  side = 'top',
  className,
}: DesktopTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  };

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className={cn(
            'absolute z-50 overflow-hidden rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-soft-md backdrop-blur-sm border border-primary/20 animate-in fade-in-0 zoom-in-96',
            sideClasses[side],
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}

// Desktop-compatible compound tooltip components
const TooltipContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({
  open: false,
  setOpen: () => {},
});

interface DesktopTooltipProviderProps {
  children: ReactNode;
}

export function DesktopTooltipProvider({ children }: DesktopTooltipProviderProps) {
  const [open, setOpen] = useState(false);
  
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      {children}
    </TooltipContext.Provider>
  );
}

export function DesktopTooltipTrigger({ 
  children, 
  asChild = false 
}: { 
  children: ReactNode; 
  asChild?: boolean; 
}) {
  const { setOpen } = useContext(TooltipContext);
  
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onMouseEnter: () => setOpen(true),
      onMouseLeave: () => setOpen(false),
    } as any);
  }
  
  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
    </div>
  );
}

export function DesktopTooltipContent({ 
  children, 
  className,
  side = 'top' 
}: { 
  children: ReactNode; 
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const { open } = useContext(TooltipContext);
  
  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2', 
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  };
  
  if (!open) return null;
  
  return (
    <div
      className={cn(
        'absolute z-50 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md border px-3 py-1.5 text-xs animate-in fade-in-0 zoom-in-95',
        sideClasses[side],
        className
      )}
    >
      {children}
    </div>
  );
}