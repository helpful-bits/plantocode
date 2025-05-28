import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, ButtonHTMLAttributes } from "react";

import { cn } from "@/utils/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/85 shadow-soft hover:shadow-soft-md backdrop-blur-sm",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/85 shadow-soft hover:shadow-soft-md",
        warning:
          "bg-warning text-warning-foreground hover:bg-warning/85 shadow-soft hover:shadow-soft-md",
        outline:
          "border border-border bg-background/80 text-foreground backdrop-blur-sm hover:bg-accent/60 hover:text-accent-foreground shadow-soft hover:shadow-soft-md",
        secondary:
          "bg-secondary/80 text-secondary-foreground hover:bg-secondary/60 border border-border/50 shadow-soft hover:shadow-soft-md backdrop-blur-sm",
        ghost:
          "hover:bg-accent/40 hover:text-accent-foreground transition-all duration-200 backdrop-blur-sm",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80",
        navigation:
          "h-10 px-5 font-medium rounded-lg transition-all duration-200 ease-out hover:bg-accent/40 focus:bg-accent/50 focus-ring border border-transparent hover:border-border/30 backdrop-blur-sm",
        "navigation-active":
          "h-10 px-5 font-medium rounded-lg transition-all duration-200 ease-out bg-primary/90 text-primary-foreground shadow-soft border border-primary/15 backdrop-blur-sm",
        filter:
          "border-0 rounded-none text-muted-foreground hover:bg-accent/30 hover:text-accent-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium transition-all duration-200 backdrop-blur-sm",
        "filter-active":
          "border-0 rounded-none bg-primary/10 text-primary font-medium hover:bg-primary/15 transition-all duration-200 backdrop-blur-sm",
        compact:
          "bg-secondary/60 text-secondary-foreground hover:bg-secondary/80 border border-border/40 shadow-sm hover:shadow-md transition-all duration-200 backdrop-blur-sm",
      },
      size: {
        default: "h-10 px-4 py-2",
        xs: "h-7 rounded-md px-2 text-xs",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        "icon-xs": "h-6 w-6",
        "icon-sm": "h-7 w-7",
        "icon-lg": "h-11 w-11",
        compact: "h-8 px-2 py-1 text-xs",
        "compact-sm": "h-6 px-1.5 py-0.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
  loadingIcon?: React.ReactElement | null | undefined;
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" | "compact" | "compact-sm";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      loadingText,
      loadingIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    // Enhanced loading indicator with smoother animation and better proportions
    // Adjusted sizing and animation parameters for a more subtle and professional loading indicator
    const LoadingIndicator = loadingIcon || (
      <svg
        className="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5 text-current opacity-90"
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

    // Determine content based on loading state
    const content = isLoading ? (
      <>
        {LoadingIndicator}
        {loadingText || children}
      </>
    ) : (
      children
    );

    // Apply consistent width to prevent layout shifts during loading
    // Use a more stable width preservation strategy
    const buttonStyle = {
      transition: "all 200ms ease-in-out",
      position: "relative" as const,
      // Prevent width changes during loading by maintaining original button width
      ...(isLoading && { 
        minWidth: "max-content",
        width: "auto" 
      }),
    };

    // Compute the loading state class
    const loadingStateClass = isLoading ? "relative cursor-wait" : "";

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          loadingStateClass
        )}
        ref={ref}
        disabled={disabled || isLoading}
        style={buttonStyle}
        aria-busy={isLoading}
        {...props}
      >
        {content}
      </Comp>
    );
  }
);
Button.displayName = "Button";
// Keep exports
export { Button, buttonVariants };
