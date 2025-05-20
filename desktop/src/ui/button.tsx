import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/utils/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/80",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive dark:text-destructive-foreground",
        warning:
          "bg-warning text-warning-foreground hover:bg-warning/90 dark:bg-warning dark:text-warning-foreground",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground dark:border-border dark:bg-transparent dark:hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-secondary dark:text-secondary-foreground dark:hover:bg-secondary/70",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/30 dark:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline dark:text-primary-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
  loadingIcon?: React.ReactNode;
  variant?:
    | "default"
    | "destructive"
    | "warning"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
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

    // Apply fixed width and transition styles to prevent button size changes
    // This ensures a more stable UI during loading states
    const buttonStyle = {
      minWidth: isLoading ? "max-content" : undefined,
      transition: "all 200ms ease-in-out",
      position: "relative" as const,
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
