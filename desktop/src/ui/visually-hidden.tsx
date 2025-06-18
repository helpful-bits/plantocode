"use client";

import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/utils/utils";

const VisuallyHidden = forwardRef<
  HTMLSpanElement,
  HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn("sr-only", className)}
    {...props}
  />
));
VisuallyHidden.displayName = "VisuallyHidden";

export { VisuallyHidden };