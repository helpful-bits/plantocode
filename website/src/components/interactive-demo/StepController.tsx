/**
 * StepController - Viewport-only tracker with deterministic reset key
 * Zero progress logic, minimal threshold, predictable onEnter/onLeave
 */
"use client";

import { ReactNode, useRef, useState, useEffect } from 'react';
import { trackDemo } from '@/lib/track';

interface StepControllerProps {
  children: ReactNode | ((props: { 
    isInView: boolean; 
    resetKey: number;
  }) => ReactNode);
  className?: string;
  onEnter?: () => void;
  onLeave?: () => void;
  stepName?: string;
}

export function StepController({ children, className, onEnter, onLeave, stepName }: StepControllerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);
  const previousIsInViewRef = useRef(false);

  // Simple intersection observer with minimal threshold and error handling
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    try {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry && ref.current) { // Ensure element still exists
            const currentIsInView = entry.isIntersecting;
            const previousIsInView = previousIsInViewRef.current;
            
            setIsInView(currentIsInView);
            
            // Track transitions: false→true triggers onEnter and increments resetCounter
            if (!previousIsInView && currentIsInView) {
              setResetCounter(prev => prev + 1);
              try {
                onEnter?.();
                // Track demo interaction when entering view
                if (stepName) {
                  trackDemo(stepName, 'view');
                }
              } catch (error) {
                console.warn('Error in onEnter callback:', error);
              }
            }
            // true→false triggers onLeave
            else if (previousIsInView && !currentIsInView) {
              try {
                onLeave?.();
              } catch (error) {
                console.warn('Error in onLeave callback:', error);
              }
            }
            
            previousIsInViewRef.current = currentIsInView;
          }
        },
        { threshold: 0.2, rootMargin: "0px 0px -25% 0px" }
      );

      observerRef.current = observer;
      observer.observe(element);
      
      return () => {
        try {
          observerRef.current?.disconnect();
        } catch (error) {
          console.warn('Error disconnecting intersection observer:', error);
        } finally {
          observerRef.current = null;
        }
      };
    } catch (error) {
      console.warn('Error creating intersection observer:', error);
      // Fallback: assume always in view
      setIsInView(true);
    }
  }, [onEnter, onLeave, stepName]);

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