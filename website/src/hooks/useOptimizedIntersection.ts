import { useEffect, useRef, useState, useMemo } from 'react';

interface UseOptimizedIntersectionOptions {
  threshold?: number | number[];
  rootMargin?: string;
  triggerOnce?: boolean;
  disabled?: boolean;
}

export function useOptimizedIntersection<T extends Element = HTMLDivElement>({
  threshold = 0.1,
  rootMargin = '50px',
  triggerOnce = true,
  disabled = false
}: UseOptimizedIntersectionOptions = {}) {
  const elementRef = useRef<T>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);

  // Create observer with memoized options for performance
  const observer = useMemo(() => {
    if (typeof window === 'undefined' || disabled) return null;
    
    return new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const isVisible = entry.isIntersecting;
          
          if (isVisible) {
            setIsIntersecting(true);
            if (triggerOnce && !hasTriggered) {
              setHasTriggered(true);
            }
          } else if (!triggerOnce) {
            setIsIntersecting(false);
          }
        });
      },
      {
        threshold,
        rootMargin,
        // Performance optimization: use 'passive' behavior
      }
    );
  }, [threshold, rootMargin, triggerOnce, hasTriggered, disabled]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !observer || (triggerOnce && hasTriggered)) return;

    observer.observe(element);

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [observer, triggerOnce, hasTriggered]);

  // Clean up observer on unmount
  useEffect(() => {
    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [observer]);

  return {
    ref: elementRef,
    isIntersecting: triggerOnce ? hasTriggered : isIntersecting,
    hasTriggered
  };
}

// Performance-optimized hook for multiple elements
export function useBatchedIntersection<T extends Element = HTMLDivElement>(
  count: number,
  options: UseOptimizedIntersectionOptions = {}
) {
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());
  const elementRefs = useRef<(T | null)[]>(Array(count).fill(null));
  
  const observer = useMemo(() => {
    if (typeof window === 'undefined' || options.disabled) return null;
    
    return new IntersectionObserver(
      (entries) => {
        const updates = new Set(visibleItems);
        
        entries.forEach((entry) => {
          const index = elementRefs.current.indexOf(entry.target as T);
          if (index !== -1) {
            if (entry.isIntersecting) {
              updates.add(index);
            } else if (!options.triggerOnce) {
              updates.delete(index);
            }
          }
        });
        
        if (updates.size !== visibleItems.size || 
            [...updates].some(item => !visibleItems.has(item))) {
          setVisibleItems(new Set(updates));
        }
      },
      {
        threshold: options.threshold ?? 0.1,
        rootMargin: options.rootMargin ?? '50px',
      }
    );
  }, [options.threshold, options.rootMargin, options.triggerOnce, options.disabled, visibleItems]);

  useEffect(() => {
    if (!observer) return;
    
    elementRefs.current.forEach((element) => {
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [observer]);

  const setRef = (index: number) => (element: T | null) => {
    elementRefs.current[index] = element;
  };

  return {
    setRef,
    isVisible: (index: number) => visibleItems.has(index),
    visibleCount: visibleItems.size
  };
}