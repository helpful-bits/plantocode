import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/85",
        outline:
          "border border-border bg-background/80 text-foreground backdrop-blur-sm hover:bg-accent/60 hover:text-accent-foreground",
        secondary:
          "bg-secondary/80 text-secondary-foreground hover:bg-secondary/60 border border-border/50 backdrop-blur-sm",
        ghost:
          "hover:bg-accent/40 hover:text-accent-foreground transition-all duration-200 backdrop-blur-sm",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80",
        "gradient-outline":
          "relative bg-white dark:bg-gray-900 text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600 font-semibold border-2 border-emerald-600/50 dark:border-emerald-400/50 shadow-md hover:shadow-lg hover:shadow-emerald-500/25 transform hover:-translate-y-0.5 hover:border-emerald-600 dark:hover:border-emerald-400 transition-all",
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
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" | "compact" | "compact-sm";
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "gradient-outline";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    // Apply consistent width to prevent layout shifts during loading
    // Use a more stable width preservation strategy
    const buttonStyle = {
      transition: "all 200ms ease-in-out",
      position: "relative" as const,
    };

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className })
        )}
        ref={ref}
        disabled={disabled}
        style={buttonStyle}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };