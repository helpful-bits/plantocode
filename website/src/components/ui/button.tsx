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
          "bg-gradient-to-r from-[oklch(0.48_0.15_195)] via-[oklch(0.58_0.12_195)] to-[oklch(0.68_0.08_195)] hover:from-[oklch(0.45_0.16_195)] hover:via-[oklch(0.55_0.13_195)] hover:to-[oklch(0.65_0.09_195)] text-white border-0 shadow-lg shadow-[oklch(0.48_0.15_195)]/25 hover:shadow-xl hover:shadow-[oklch(0.48_0.15_195)]/40 hover:scale-105 active:scale-95 backdrop-blur-sm",
        destructive:
          "bg-gradient-to-r from-[oklch(0.53_0.24_25)] to-[oklch(0.50_0.26_25)] hover:from-[oklch(0.48_0.26_25)] hover:to-[oklch(0.45_0.28_25)] text-white shadow-lg shadow-[oklch(0.53_0.24_25)]/25 hover:shadow-xl hover:shadow-[oklch(0.53_0.24_25)]/40 hover:scale-105 active:scale-95",
        outline:
          "border-2 border-[oklch(0.48_0.15_195)]/30 dark:border-[oklch(0.68_0.08_195)]/30 bg-background/50 backdrop-blur-md text-[oklch(0.48_0.15_195)] dark:text-[oklch(0.68_0.08_195)] hover:bg-[oklch(0.48_0.15_195)]/10 hover:border-[oklch(0.48_0.15_195)]/50 dark:hover:border-[oklch(0.68_0.08_195)]/50 hover:scale-105 active:scale-95 shadow-sm",
        secondary:
          "bg-gradient-to-r from-[oklch(0.97_0.025_195)] to-[oklch(0.96_0.045_195)] dark:from-[oklch(0.25_0.03_206)] dark:to-[oklch(0.18_0.02_206)] text-[oklch(0.18_0.02_206)] dark:text-[oklch(0.9_0_0)] border border-[oklch(0.48_0.15_195)]/20 hover:from-[oklch(0.94_0.05_195)] hover:to-[oklch(0.92_0.06_195)] dark:hover:from-[oklch(0.30_0.04_206)] dark:hover:to-[oklch(0.22_0.03_206)] hover:scale-105 active:scale-95 shadow-sm",
        ghost:
          "hover:bg-[oklch(0.96_0.045_195)] dark:hover:bg-[oklch(0.25_0.03_206)] text-[oklch(0.35_0_0)] dark:text-[oklch(0.7_0_0)] hover:text-[oklch(0.18_0.02_206)] dark:hover:text-[oklch(0.9_0_0)] hover:scale-105 active:scale-95",
        link: "text-[oklch(0.48_0.15_195)] dark:text-[oklch(0.68_0.08_195)] underline-offset-4 hover:underline hover:text-[oklch(0.45_0.16_195)] dark:hover:text-[oklch(0.70_0.09_195)]",
        "gradient-outline":
          "relative bg-gradient-to-r from-background to-card dark:from-card dark:to-background text-[oklch(0.48_0.15_195)] dark:text-[oklch(0.68_0.08_195)] font-semibold border-2 border-[oklch(0.48_0.15_195)]/50 dark:border-[oklch(0.68_0.08_195)]/50 shadow-lg shadow-[oklch(0.48_0.15_195)]/10 hover:shadow-xl hover:shadow-[oklch(0.48_0.15_195)]/20 hover:scale-105 hover:border-[oklch(0.48_0.15_195)]/70 dark:hover:border-[oklch(0.68_0.08_195)]/70 active:scale-95 backdrop-blur-sm",
        primary:
          "bg-gradient-to-r from-[oklch(0.48_0.15_195)] via-[oklch(0.58_0.12_195)] to-[oklch(0.68_0.08_195)] hover:from-[oklch(0.45_0.16_195)] hover:via-[oklch(0.55_0.13_195)] hover:to-[oklch(0.65_0.09_195)] text-white shadow-lg shadow-[oklch(0.48_0.15_195)]/25 hover:shadow-xl hover:shadow-[oklch(0.48_0.15_195)]/40 hover:scale-105 active:scale-95 backdrop-blur-sm",
        cta:
          "bg-gradient-to-r from-[oklch(0.45_0.16_195)] via-[oklch(0.48_0.15_195)] to-[oklch(0.58_0.12_195)] hover:from-[oklch(0.42_0.17_195)] hover:via-[oklch(0.45_0.16_195)] hover:to-[oklch(0.55_0.13_195)] text-white shadow-lg shadow-[oklch(0.48_0.15_195)]/30 hover:shadow-xl hover:shadow-[oklch(0.48_0.15_195)]/50 hover:scale-105 active:scale-95 backdrop-blur-sm ring-1 ring-white/20",
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