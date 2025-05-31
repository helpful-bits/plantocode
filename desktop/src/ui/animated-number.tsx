"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/utils/utils";

interface AnimatedNumberProps {
  value: number | null;
  previousValue?: number | null;
  className?: string;
  formatValue?: (value: number) => string;
  duration?: number;
}

export function AnimatedNumber({ 
  value, 
  previousValue, 
  className = "",
  formatValue = (val) => val.toLocaleString(),
  duration = 300
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState<number | null>(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const startValueRef = useRef<number | null>(null);

  useEffect(() => {
    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // If we don't have a previous value or current value is null, just set immediately
    if (previousValue === undefined || value === null || previousValue === null) {
      setDisplayValue(value);
      setIsAnimating(false);
      return;
    }

    // If values are the same, no animation needed
    if (value === previousValue) {
      setDisplayValue(value);
      setIsAnimating(false);
      return;
    }

    // Start animation
    setIsAnimating(true);
    startValueRef.current = displayValue ?? previousValue;
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      if (!startTimeRef.current || startValueRef.current === null) return;

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Use easeOutQuart easing for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 4);
      
      const currentValue = startValueRef.current + (value - startValueRef.current) * eased;
      setDisplayValue(Math.round(currentValue));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
        setIsAnimating(false);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, previousValue, duration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (displayValue === null) {
    return null;
  }

  return (
    <span 
      className={cn(
        "transition-all duration-200",
        isAnimating && "text-primary font-medium scale-105",
        className
      )}
    >
      {formatValue(displayValue)}
    </span>
  );
}