"use client";

import { useParallax } from "react-scroll-parallax";
import { cn } from "@/lib/utils";

interface ParallaxProps {
  speed?: number;
  className?: string;
  children: React.ReactNode;
}

export function Parallax({ speed = -5, className, children }: ParallaxProps) {
  const { ref } = useParallax({
    speed: speed * 0.3, // Reduce parallax intensity
    easing: "easeOutQuad",
  }) as { ref: React.RefObject<HTMLDivElement> };

  return (
    <div
      ref={ref}
      className={cn("will-change-transform transform-gpu", className)}
      style={{ transform: 'translateZ(0)' }} // Force GPU acceleration
    >
      {children}
    </div>
  );
}