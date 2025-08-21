// Exact replica of desktop/src/ui/checkbox.tsx
'use client';

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DesktopCheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

const DesktopCheckbox = React.forwardRef<HTMLInputElement, DesktopCheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e);
      onCheckedChange?.(e.target.checked);
    };

    return (
      <div className="custom-checkbox-container">
        <input
          type="checkbox"
          className={cn("custom-checkbox", className)}
          ref={ref}
          checked={checked}
          onChange={handleChange}
          {...props}
        />
        <div className="custom-checkbox-checkmark">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
      </div>
    );
  }
);
DesktopCheckbox.displayName = "DesktopCheckbox";

export { DesktopCheckbox };