import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ButtonHTMLAttributes } from "react";

import { cn } from "@/utils/utils";


const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-border/50 px-2.5 py-0.5 text-xs font-medium transition-all duration-200 backdrop-blur-sm",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary/90 text-primary-foreground",
        secondary:
          "border-border/50 bg-secondary/80 text-secondary-foreground",
        destructive:
          "border-destructive/20 bg-destructive/90 text-destructive-foreground",
        outline: "text-soft border-border/50",
        warning:
          "border-warning/20 bg-warning/90 text-warning-foreground",
        success:
          "border-success/20 bg-success/90 text-success-foreground",
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
        "focus-ring cursor-pointer",
        className
      )} 
      {...props} 
    />
  );
}

export { Badge, badgeVariants, ButtonBadge };
