"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import { forwardRef, ElementRef, ComponentPropsWithoutRef } from "react";

import { cn } from "@/utils/utils";

const Slider = forwardRef<
  ElementRef<typeof SliderPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center py-3",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary/80 border border-border/30">
      <SliderPrimitive.Range className="absolute h-full bg-primary shadow-soft" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent/30 hover:border-primary/80 hover:cursor-pointer hover:shadow-soft" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };