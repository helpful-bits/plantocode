import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/utils';

interface AnimatedNumberProps {
  value: number;
  duration?: number; // Duration in milliseconds
  format?: (value: number) => string;
  className?: string;
}

export function AnimatedNumber({ 
  value, 
  duration = 500, 
  format = (v) => v.toLocaleString(),
  className 
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const previousValueRef = useRef(value);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    // Only animate if the value actually changed
    if (previousValueRef.current === value) {
      return;
    }

    const startValue = previousValueRef.current;
    const endValue = value;
    const diff = endValue - startValue;

    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Start animation
    setIsAnimating(true);
    startTimeRef.current = Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsed = now - (startTimeRef.current || now);
      const progress = Math.min(elapsed / duration, 1);

      // Use easeInOutCubic for smooth animation
      const easeInOutCubic = (t: number) => {
        return t < 0.5 
          ? 4 * t * t * t 
          : 1 - Math.pow(-2 * t + 2, 3) / 2;
      };

      const easedProgress = easeInOutCubic(progress);
      const currentValue = startValue + (diff * easedProgress);

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        previousValueRef.current = endValue;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span 
      className={cn(
        "transition-opacity duration-150",
        isAnimating && "opacity-90",
        className
      )}
    >
      {format(displayValue)}
    </span>
  );
}