import { useEffect, useRef, useState, useCallback } from 'react';
import { startTransition } from 'react';

interface UseLazyComponentOptions {
  rootMargin?: string;
  threshold?: number;
  priority?: 'high' | 'medium' | 'low';
  delay?: number;
  once?: boolean;
  fallback?: React.ComponentType;
}

interface UseLazyComponentReturn {
  isVisible: boolean;
  isLoaded: boolean;
  elementRef: React.RefObject<HTMLElement | null>;
  load: () => void;
  unload: () => void;
}

export function useLazyComponent(
  options: UseLazyComponentOptions = {}
): UseLazyComponentReturn {
  const {
    rootMargin = '50px 0px',
    threshold = 0.01,
    priority = 'medium',
    delay = 0,
    once = true,
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const elementRef = useRef<HTMLElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(() => {
    if (isLoaded) return;

    const loadComponent = () => {
      if (priority === 'low') {
        startTransition(() => {
          setIsLoaded(true);
        });
      } else {
        setIsLoaded(true);
      }
    };

    if (delay > 0) {
      timeoutRef.current = setTimeout(loadComponent, delay);
    } else {
      loadComponent();
    }
  }, [isLoaded, priority, delay]);

  const unload = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsLoaded(false);
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            load();
            
            if (once) {
              observerRef.current?.unobserve(entry.target);
            }
          } else if (!once) {
            setIsVisible(false);
            unload();
          }
        });
      },
      {
        rootMargin,
        threshold,
      }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [rootMargin, threshold, load, unload, once]);

  return {
    isVisible,
    isLoaded,
    elementRef,
    load,
    unload,
  };
}

// Higher-order component for lazy loading
// Note: This has been removed as it contains JSX which cannot be in a .ts file.
// Use the createLazyComponent function below with Next.js dynamic imports instead.

// Hook for lazy loading with dynamic imports
export function useLazyDynamicImport<T>(
  importFn: () => Promise<{ default: T }>,
  options: UseLazyComponentOptions = {}
) {
  const [component, setComponent] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const { isVisible, isLoaded, elementRef, load } = useLazyComponent(options);

  useEffect(() => {
    if (isVisible && isLoaded && !component) {
      importFn()
        .then((module) => {
          if (options.priority === 'low') {
            startTransition(() => {
              setComponent(module.default);
            });
          } else {
            setComponent(module.default);
          }
        })
        .catch((err) => {
          setError(err);
        });
    }
  }, [isVisible, isLoaded, component, importFn, options.priority]);

  return {
    component,
    error,
    isVisible,
    isLoaded,
    elementRef,
    load,
  };
}

// Hook for lazy loading multiple components
export function useLazyComponents<T extends Record<string, () => Promise<{ default: any }>>>(
  components: T,
  options: UseLazyComponentOptions = {}
) {
  const [loadedComponents, setLoadedComponents] = useState<Partial<{
    [K in keyof T]: T[K] extends () => Promise<{ default: infer U }> ? U : never;
  }>>({});
  const [errors, setErrors] = useState<Partial<Record<keyof T, Error>>>({});
  const { isVisible, isLoaded, elementRef, load } = useLazyComponent(options);

  useEffect(() => {
    if (isVisible && isLoaded) {
      const loadPromises = Object.entries(components).map(([key, importFn]) => {
        return (importFn as () => Promise<{ default: any }>)()
          .then((module) => ({ key, component: module.default }))
          .catch((error) => ({ key, error }));
      });

      Promise.all(loadPromises).then((results) => {
        const newComponents: any = {};
        const newErrors: any = {};

        results.forEach((result) => {
          if ('component' in result) {
            newComponents[result.key] = result.component;
          } else if ('error' in result) {
            newErrors[result.key] = result.error;
          }
        });

        if (options.priority === 'low') {
          startTransition(() => {
            setLoadedComponents(newComponents);
            setErrors(newErrors);
          });
        } else {
          setLoadedComponents(newComponents);
          setErrors(newErrors);
        }
      });
    }
  }, [isVisible, isLoaded, components, options.priority]);

  return {
    components: loadedComponents,
    errors,
    isVisible,
    isLoaded,
    elementRef,
    load,
  };
}

// Hook for lazy loading with progressive enhancement
export function useProgressiveLazyLoading<T>(
  stages: Array<{
    name: string;
    importFn: () => Promise<{ default: T }>;
    condition?: () => boolean;
    fallback?: React.ComponentType;
  }>,
  options: UseLazyComponentOptions = {}
) {
  const [currentStage, setCurrentStage] = useState<number>(0);
  const [components, setComponents] = useState<Array<T | null>>([]);
  const [errors, setErrors] = useState<Array<Error | null>>([]);
  const { isVisible, isLoaded, elementRef, load } = useLazyComponent(options);

  useEffect(() => {
    if (!isVisible || !isLoaded || currentStage >= stages.length) return;

    const stage = stages[currentStage];
    if (!stage) return;
    
    // Check condition if provided
    if (stage.condition && !stage.condition()) {
      setCurrentStage(prev => prev + 1);
      return;
    }

    stage.importFn()
      .then((module) => {
        if (options.priority === 'low') {
          startTransition(() => {
            setComponents(prev => {
              const newComponents = [...prev];
              newComponents[currentStage] = module.default;
              return newComponents;
            });
            setCurrentStage(prev => prev + 1);
          });
        } else {
          setComponents(prev => {
            const newComponents = [...prev];
            newComponents[currentStage] = module.default;
            return newComponents;
          });
          setCurrentStage(prev => prev + 1);
        }
      })
      .catch((error) => {
        setErrors(prev => {
          const newErrors = [...prev];
          newErrors[currentStage] = error;
          return newErrors;
        });
        setCurrentStage(prev => prev + 1);
      });
  }, [isVisible, isLoaded, currentStage, stages, options.priority]);

  return {
    components,
    errors,
    currentStage,
    isVisible,
    isLoaded,
    elementRef,
    load,
    isComplete: currentStage >= stages.length,
  };
}

// Utility function to create lazy components with Next.js dynamic
// This should be used in a .tsx file, not here.
// Example usage:
// const LazyComponent = dynamic(() => import('./MyComponent'), {
//   loading: () => <div>Loading...</div>,
//   ssr: false
// });
//
// Then use the useLazyComponent hook to control when it loads:
// const { isVisible, elementRef } = useLazyComponent({ threshold: 0.1 });
// return <div ref={elementRef}>{isVisible && <LazyComponent />}</div>

// Hook for lazy loading with intersection observer V2 (if available)
export function useAdvancedLazyLoading(
  callback: (entry: IntersectionObserverEntry) => void,
  options: UseLazyComponentOptions & {
    trackVisibility?: boolean;
    delay?: number;
  } = {}
) {
  const {
    rootMargin = '50px 0px',
    threshold = 0.01,
    trackVisibility = false,
    delay: observerDelay = 0,
  } = options;

  const elementRef = useRef<HTMLElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return;
    }

    const observerOptions: IntersectionObserverInit = {
      rootMargin,
      threshold,
    };

    // Add V2 options if supported
    if ('IntersectionObserverEntry' in window && trackVisibility) {
      // Check if IntersectionObserver supports v2 features
      try {
        const testOptions = { ...observerOptions, trackVisibility: true, delay: 100 };
        const testObserver = new IntersectionObserver(() => {}, testOptions);
        testObserver.disconnect();
        // If we get here, v2 is supported
        (observerOptions as any).trackVisibility = true;
        (observerOptions as any).delay = observerDelay;
      } catch {
        // V2 not supported, continue without those options
      }
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(callback);
      },
      observerOptions
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [rootMargin, threshold, trackVisibility, observerDelay, callback]);

  return {
    elementRef,
    observer: observerRef.current,
  };
}