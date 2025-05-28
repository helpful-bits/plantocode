import { forwardRef, TextareaHTMLAttributes, ReactNode } from "react";

import { cn } from "@/utils/utils";

// Extended TextareaProps with loading states
export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  isLoading?: boolean;
  loadingIndicator?: ReactNode;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, isLoading = false, loadingIndicator, ...props }, ref) => {
    // Use a more subtle loading indicator - pulsing border with right-aligned spinner
    const loadingClasses = isLoading
      ? "border-primary/60 pr-10" // Add padding for spinner
      : "";

    // Default spinner if no loading indicator is provided
    const defaultLoadingIndicator = (
      <div className="bg-background/85 backdrop-blur-[1px] px-2 py-1 rounded-md border shadow-sm">
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
      </div>
    );

    return (
      <div className="relative w-full">
        <textarea
          className={cn(
            "flex min-h-[80px] w-full rounded-lg border border-border/60 bg-input/50 backdrop-blur-sm px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50 transition-colors transition-shadow duration-200 hover:border-border/80 focus:border-primary/40",
            loadingClasses,
            className
          )}
          disabled={props.disabled || isLoading}
          aria-busy={isLoading}
          ref={ref}
          {...props}
        />

        {/* Always show loading indicator when isLoading=true, using default if none provided */}
        {/* Position the indicator adaptively - top-right for smaller textareas, center-right for larger ones */}
        {isLoading && (
          <div className="absolute right-3 top-3 pointer-events-none">
            {loadingIndicator || defaultLoadingIndicator}
          </div>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea }; // Keep export