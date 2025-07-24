import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus:outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-3 disabled:pointer-events-none disabled:opacity-50 cursor-pointer transform-gpu",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-primary via-primary/80 to-primary/60 hover:from-primary/90 hover:via-primary/70 hover:to-primary/50 text-primary-foreground border-0 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 active:scale-95 backdrop-blur-sm",
        destructive:
          "bg-gradient-to-r from-destructive to-destructive/90 hover:from-destructive/90 hover:to-destructive/80 text-destructive-foreground shadow-lg shadow-destructive/25 hover:shadow-xl hover:shadow-destructive/40 hover:scale-105 active:scale-95",
        outline:
          "border-2 border-primary/30 bg-background/50 backdrop-blur-md text-primary hover:bg-primary/10 hover:border-primary/50 hover:scale-105 active:scale-95 shadow-sm",
        secondary:
          "bg-gradient-to-r from-secondary to-accent text-secondary-foreground border border-primary/20 hover:from-secondary/90 hover:to-accent/90 hover:scale-105 active:scale-95 shadow-sm",
        ghost:
          "hover:bg-accent hover:text-accent-foreground text-muted-foreground hover:scale-105 active:scale-95",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80",
        "gradient-outline":
          "relative bg-gradient-to-r from-background to-card text-primary font-semibold border-2 border-primary/50 shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/20 hover:scale-105 hover:border-primary/70 active:scale-95 backdrop-blur-sm",
        primary:
          "bg-gradient-to-r from-primary via-primary/80 to-primary/60 hover:from-primary/90 hover:via-primary/70 hover:to-primary/50 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 active:scale-95 backdrop-blur-sm",
        cta:
          "relative text-white font-bold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 backdrop-blur-sm ring-2 border transition-all duration-200 cta-button",
      },
      size: {
        default: "h-10 px-4 py-2",
        xs: "h-7 rounded-lg px-2 text-xs",
        sm: "h-9 rounded-lg px-3",
        lg: "h-12 rounded-xl px-8 py-3 text-base font-bold",
        xl: "h-14 rounded-xl px-10 py-4 text-lg font-bold",
        icon: "h-10 w-10",
        "icon-xs": "h-6 w-6 rounded-lg",
        "icon-sm": "h-7 w-7 rounded-lg",
        "icon-lg": "h-11 w-11 rounded-xl",
        compact: "h-8 px-2 py-1 text-xs rounded-lg",
        "compact-sm": "h-6 px-1.5 py-0.5 text-xs rounded-md",
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
  size?: "default" | "xs" | "sm" | "lg" | "xl" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" | "compact" | "compact-sm";
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "gradient-outline" | "primary" | "cta";
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
      transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
      position: "relative" as const,
      transformStyle: "preserve-3d" as const,
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