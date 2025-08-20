/**
 * Collapsible components replicating desktop app styling for mobile demo.
 * These components are purely visual and functional for demo purposes.
 */
'use client';

import { cn } from '@/lib/utils';
import { ReactNode, useState, createContext, useContext, cloneElement, isValidElement } from 'react';

interface CollapsibleContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CollapsibleContext = createContext<CollapsibleContextType>({
  open: false,
  setOpen: () => {},
});

export interface DesktopCollapsibleProps {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export interface DesktopCollapsibleTriggerProps {
  children: ReactNode;
  asChild?: boolean;
  className?: string;
}

export interface DesktopCollapsibleContentProps {
  children: ReactNode;
  className?: string;
}

export function DesktopCollapsible({ 
  children, 
  open: controlledOpen, 
  onOpenChange, 
  className 
}: DesktopCollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setInternalOpen(open);
    }
  };

  return (
    <CollapsibleContext.Provider value={{ open: isOpen, setOpen }}>
      <div className={cn(className)}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
}

export function DesktopCollapsibleTrigger({ 
  children, 
  asChild = false, 
  className 
}: DesktopCollapsibleTriggerProps) {
  const { open, setOpen } = useContext(CollapsibleContext);

  if (asChild && isValidElement(children)) {
    const childElement = children as React.ReactElement<any>;
    const wrappedHandler = (event?: React.MouseEvent) => {
      setOpen(!open);
      if (childElement.props?.onClick) {
        childElement.props.onClick(event);
      }
    };
    
    return cloneElement(childElement, { 
      onClick: wrappedHandler, 
      className: cn(childElement.props.className, className) 
    });
  }

  return (
    <button
      onClick={() => setOpen(!open)}
      className={cn(className)}
    >
      {children}
    </button>
  );
}

export function DesktopCollapsibleContent({ 
  children, 
  className 
}: DesktopCollapsibleContentProps) {
  const { open } = useContext(CollapsibleContext);

  if (!open) return null;

  return (
    <div className={cn('overflow-hidden transition-all duration-300', className)}>
      {children}
    </div>
  );
}