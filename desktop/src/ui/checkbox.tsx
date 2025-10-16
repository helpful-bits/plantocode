"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/utils/utils";

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

const BaseCheckbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
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
          <Check className="h-3 w-3" />
        </div>
      </div>
    );
  }
);
BaseCheckbox.displayName = "BaseCheckbox";

export const Checkbox = React.memo(BaseCheckbox);