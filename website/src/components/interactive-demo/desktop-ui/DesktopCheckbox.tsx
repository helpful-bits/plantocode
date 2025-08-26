// Exact replica of desktop/src/ui/checkbox.tsx
'use client';

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DesktopCheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

const DesktopCheckbox = React.forwardRef<HTMLInputElement, DesktopCheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, children, ...props }, ref) => {
    const id = props.id ?? React.useId();
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e);
      onCheckedChange?.(e.target.checked);
    };

    return (
      <label htmlFor={id} className="inline-flex items-center gap-2 cursor-pointer">
        <div className="custom-checkbox-container">
          <input
            id={id}
            type="checkbox"
            className={cn("custom-checkbox", className)}
            ref={ref}
            checked={checked}
            onChange={handleChange}
            aria-label={props['aria-label'] || props.title || 'toggle option'}
            {...props}
          />
          <div className="custom-checkbox-checkmark">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
        </div>
        {children ? <span>{children}</span> : null}
      </label>
    );
  }
);
DesktopCheckbox.displayName = "DesktopCheckbox";

export { DesktopCheckbox };