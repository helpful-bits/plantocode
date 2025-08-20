/**
 * StepController - Ultra-simplified scroll tracker with stable hooks
 * Zero conditional logic, zero complex patterns, zero early returns
 */
"use client";

import { ReactNode, useRef, useState, useEffect } from 'react';

// Static thresholds array to prevent recreation
const THRESHOLDS = Array.from({ length: 101 }, (_, i) => i / 100);

interface StepControllerProps {
  children: ReactNode | ((props: { 
    isInView: boolean; 
    progress: number;
  }) => ReactNode);
  className?: string;
}

export function StepController({ children, className }: StepControllerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [progress, setProgress] = useState(0);

  // Static thresholds array to prevent recreation on every render

  // Simple intersection observer
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsInView(entry.isIntersecting);
          setProgress(Math.max(0, Math.min(entry.intersectionRatio ?? 0, 1)));
        }
      },
      { threshold: THRESHOLDS }
    );

    observerRef.current = observer;
    observer.observe(element);
    
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {typeof children === 'function' 
        ? children({ isInView, progress })
        : children
      }
    </div>
  );
}

export default StepController;