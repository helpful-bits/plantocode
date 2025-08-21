/**
 * StepController - Viewport-only tracker with deterministic reset key
 * Zero progress logic, minimal threshold, predictable onEnter/onLeave
 */
"use client";

import { ReactNode, useRef, useState, useEffect } from 'react';

interface StepControllerProps {
  children: ReactNode | ((props: { 
    isInView: boolean; 
    resetKey: number;
  }) => ReactNode);
  className?: string;
  onEnter?: () => void;
  onLeave?: () => void;
}

export function StepController({ children, className, onEnter, onLeave }: StepControllerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);
  const previousIsInViewRef = useRef(false);

  // Simple intersection observer with minimal threshold
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          const currentIsInView = entry.isIntersecting;
          const previousIsInView = previousIsInViewRef.current;
          
          setIsInView(currentIsInView);
          
          // Track transitions: false→true triggers onEnter and increments resetCounter
          if (!previousIsInView && currentIsInView) {
            setResetCounter(prev => prev + 1);
            onEnter?.();
          }
          // true→false triggers onLeave
          else if (previousIsInView && !currentIsInView) {
            onLeave?.();
          }
          
          previousIsInViewRef.current = currentIsInView;
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -25% 0px" }
    );

    observerRef.current = observer;
    observer.observe(element);
    
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [onEnter, onLeave]);

  return (
    <div ref={ref} className={className}>
      {typeof children === 'function' 
        ? children({ isInView, resetKey: resetCounter })
        : children
      }
    </div>
  );
}

export default StepController;