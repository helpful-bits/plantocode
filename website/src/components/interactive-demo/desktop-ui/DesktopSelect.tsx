// Presentational-only select component replicating desktop app styling for mobile demo
'use client';

import { cn } from '@/lib/utils';
import React, { ReactNode, useState } from 'react';

export interface DesktopSelectOptionType {
  value: string;
  label: string;
}

export interface DesktopSelectProps {
  options?: DesktopSelectOptionType[];
  children?: React.ReactNode;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onChange?: (value: string) => void;
}

export interface DesktopSelectTriggerProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export interface DesktopSelectContentProps {
  children: ReactNode;
  className?: string;
}

export interface DesktopSelectItemProps {
  children: ReactNode;
  value: string;
  className?: string;
  onClick?: () => void;
}

export function DesktopSelect({
  options,
  children,
  value,
  placeholder = 'Select an option...',
  disabled = false,
  className,
  onChange,
}: DesktopSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Convert children to array and filter option elements
  const childrenArray = React.Children.toArray(children);
  const optionChildren = childrenArray.filter((child) =>
    React.isValidElement<DesktopSelectItemProps>(child) && 
    child.type === DesktopSelectItem
  ) as React.ReactElement<DesktopSelectItemProps>[];
  
  // Detect first non-option child as custom trigger content
  const customTriggerContent = childrenArray.find((child) =>
    !React.isValidElement<DesktopSelectItemProps>(child) || 
    child.type !== DesktopSelectItem
  );

  // Helper function to find selected label from option children only
  const getSelectedLabelFromChildren = (): string | undefined => {
    if (!optionChildren || !value) return undefined;

    let selectedLabel: string | undefined;
    optionChildren.forEach((child) => {
      if (child.props.value === value) {
        selectedLabel = typeof child.props.children === 'string' 
          ? child.props.children 
          : String(child.props.children);
      }
    });
    return selectedLabel;
  };

  // Determine the selected label based on available data
  const getSelectedLabel = (): string => {
    if (options) {
      const selectedOption = options.find(option => option.value === value);
      return selectedOption?.label || placeholder;
    } else if (optionChildren) {
      return getSelectedLabelFromChildren() || placeholder;
    }
    return placeholder;
  };

  const selectedLabel = getSelectedLabel();
  const hasSelection = (options && options.find(option => option.value === value)) || 
                      (optionChildren && getSelectedLabelFromChildren());

  // Helper function to enhance only option children
  const enhanceOptionChildren = (children: React.ReactElement<DesktopSelectItemProps>[]): React.ReactNode => {
    return children.map((child, index) => {
      const originalOnClick = child.props.onClick;
      return React.cloneElement(child, {
        key: index,
        onClick: () => {
          originalOnClick?.();
          onChange?.(child.props.value);
          setIsOpen(false);
        },
      } as Partial<DesktopSelectItemProps>);
    });
  };

  return (
    <div className={cn('relative w-full', className)}>
      <DesktopSelectTrigger
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(disabled && 'opacity-50 cursor-not-allowed')}
      >
        {customTriggerContent ? (
          customTriggerContent
        ) : (
          <>
            <span className={cn(!hasSelection && 'text-muted-foreground')}>
              {selectedLabel}
            </span>
            <svg
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </DesktopSelectTrigger>

      {isOpen && !disabled && (
        <DesktopSelectContent>
          {optionChildren ? (
            enhanceOptionChildren(optionChildren)
          ) : options ? (
            options.map((option) => (
              <DesktopSelectItem
                key={option.value}
                value={option.value}
                onClick={() => {
                  onChange?.(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </DesktopSelectItem>
            ))
          ) : null}
        </DesktopSelectContent>
      )}
    </div>
  );
}

export function DesktopSelectTrigger({ children, className, onClick }: DesktopSelectTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-lg border border-border/50 bg-background/80 backdrop-blur-sm px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {children}
    </button>
  );
}

export function DesktopSelectContent({ children, className }: DesktopSelectContentProps) {
  return (
    <div
      className={cn(
        'absolute top-full z-50 mt-1 min-w-[8rem] overflow-hidden rounded-md border border-border/60 bg-popover/95 backdrop-blur-sm p-1 text-popover-foreground shadow-md',
        className
      )}
    >
      {children}
    </div>
  );
}

export function DesktopSelectItem({ children, className, onClick }: DesktopSelectItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
    >
      {children}
    </button>
  );
}

export const DesktopSelectOption = DesktopSelectItem;