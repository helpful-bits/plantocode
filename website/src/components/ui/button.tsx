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
          "bg-primary text-primary-foreground hover:bg-primary/85 backdrop-blur-sm",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/85",
        warning:
          "bg-warning text-warning-foreground hover:bg-warning/85",
        outline:
          "border border-border bg-background/80 text-foreground backdrop-blur-sm hover:bg-accent/60 hover:text-accent-foreground",
        secondary:
          "bg-secondary/80 text-secondary-foreground hover:bg-secondary/60 border border-border/50 backdrop-blur-sm",
        ghost:
          "hover:bg-accent/40 hover:text-accent-foreground transition-all duration-200 backdrop-blur-sm",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80",
        navigation:
          "h-10 px-5 font-medium rounded-lg transition-all duration-200 ease-out hover:bg-accent/40 focus:bg-accent/50 focus-ring border border-transparent hover:border-border/30 backdrop-blur-sm",
        "navigation-active":
          "h-10 px-5 font-medium rounded-lg transition-all duration-200 ease-out bg-primary/90 text-primary-foreground border border-primary/15 backdrop-blur-sm",
        filter:
          "border-0 rounded-none text-muted-foreground hover:bg-accent/30 hover:text-accent-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium transition-all duration-200 backdrop-blur-sm",
        "filter-active":
          "border-0 rounded-none bg-primary/10 text-primary font-medium hover:bg-primary/15 transition-all duration-200 backdrop-blur-sm",
        compact:
          "bg-secondary/60 text-secondary-foreground hover:bg-secondary/80 border border-border/40 shadow-sm hover:shadow-md transition-all duration-200 backdrop-blur-sm",
        // New glass morphism variants
        "glass-subtle":
          "glass-subtle text-foreground hover:bg-accent/20 hover:text-accent-foreground",
        "glass-normal":
          "glass text-foreground hover:bg-primary/10 hover:text-primary-foreground",
        "glass-intense":
          "glass-intense text-foreground hover:bg-primary/15 hover:text-primary-foreground",
        "glass-card":
          "glass-card text-foreground hover:bg-primary/10 hover:text-primary-foreground",
        // Premium glass button
        "premium":
          "premium-card text-foreground hover:bg-primary/20 hover:text-primary-foreground font-medium",
        // Gradient variants
        "gradient-primary":
          "gradient-primary text-primary-foreground hover:opacity-90 font-medium",
        "gradient-animated":
          "gradient-primary-animated text-primary-foreground hover:opacity-90 font-medium",
        "gradient-secondary":
          "gradient-secondary text-foreground hover:opacity-90",
        "gradient-accent":
          "gradient-accent text-foreground hover:opacity-90",
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