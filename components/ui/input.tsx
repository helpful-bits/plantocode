import * as React from "react";

import { cn } from "@/lib/utils";

// Extended InputProps with loading states
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  isLoading?: boolean;
  loadingIndicator?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, isLoading = false, loadingIndicator, ...props }, ref) => {
    // Use a more subtle loading indicator - pulsing border with right-aligned spinner
    const loadingClasses = isLoading
      ? "border-primary/50 pr-9" // Add padding for spinner and make border color less intense
      : "";

    // Default spinner if no loading indicator is provided
    const defaultLoadingIndicator = (
      <svg
        className="animate-spin h-3.5 w-3.5 text-primary/70"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2.5"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
    );

    return (
      <div className="relative w-full">
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input dark:text-foreground dark:border-border transition-colors duration-200",
            loadingClasses,
            className
          )}
          disabled={props.disabled || isLoading}
          aria-busy={isLoading}
          ref={ref}
          {...props}
        />

        {/* Always show loading indicator when isLoading=true, using default if none provided */}
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
            {loadingIndicator || defaultLoadingIndicator}
          </div>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input }; // Keep export
