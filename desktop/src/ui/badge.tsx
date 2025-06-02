import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ButtonHTMLAttributes } from "react";

import { cn } from "@/utils/utils";


const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-border/50 px-2.5 py-0.5 text-xs font-medium transition-all duration-200 backdrop-blur-sm",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary/90 text-primary-foreground hover:bg-primary/75 shadow-soft",
        secondary:
          "border-border/50 bg-secondary/80 text-secondary-foreground hover:bg-secondary/60 shadow-soft",
        destructive:
          "border-destructive/20 bg-destructive/90 text-destructive-foreground hover:bg-destructive/75 shadow-soft",
        outline: "text-soft border-border/50 hover:bg-accent/30",
        warning:
          "border-warning/20 bg-warning/90 text-warning-foreground hover:bg-warning/75 shadow-soft",
        success:
          "border-success/20 bg-success/90 text-success-foreground hover:bg-success/75 shadow-soft",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "warning" | "success";
}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export interface ButtonBadgeProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof badgeVariants> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "warning" | "success";
}

function ButtonBadge({ className, variant, ...props }: ButtonBadgeProps) {
  return (
    <button 
      className={cn(
        badgeVariants({ variant }), 
        "focus-ring cursor-pointer hover:opacity-80",
        className
      )} 
      {...props} 
    />
  );
}

export { Badge, badgeVariants, ButtonBadge };
