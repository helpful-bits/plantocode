"use client";

import { useEffect, useRef, useState, useCallback, useDeferredValue } from 'react';

interface ScrollAnimationConfig {
  threshold?: number;
  rootMargin?: string;
  damping?: number;
  stiffness?: number;
  mass?: number;
  reducedMotion?: boolean;
}

interface ScrollAnimationState {
  isVisible: boolean;
  scrollY: number;
  elementY: number;
  progress: number;
  velocity: number;
}

const DEFAULT_CONFIG: Required<ScrollAnimationConfig> = {
  threshold: 0.1,
  rootMargin: '0px 0px -10% 0px',
  damping: 0.8,
  stiffness: 0.2,
  mass: 1,
  reducedMotion: false,
};

export function useScrollAnimation(config: ScrollAnimationConfig = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const elementRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ScrollAnimationState>({
    isVisible: false,
    scrollY: 0,
    elementY: 0,
    progress: 0,
    velocity: 0,
  });
  
  // Use React 19's useDeferredValue for smooth animations
  const deferredScrollY = useDeferredValue(scrollState.scrollY);
  const deferredProgress = useDeferredValue(scrollState.progress);
  
  const lastScrollY = useRef(0);
  const lastTime = useRef(0);
  const rafId = useRef<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Check for reduced motion preference
  const prefersReducedMotion = useCallback(() => {
    return finalConfig.reducedMotion || 
           (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, [finalConfig.reducedMotion]);

  // Optimized scroll handler using requestAnimationFrame
  const updateScrollPosition = useCallback(() => {
    if (!elementRef.current) return;

    const currentTime = performance.now();
    const currentScrollY = window.scrollY;
    const deltaTime = currentTime - lastTime.current;
    const deltaScroll = currentScrollY - lastScrollY.current;
    
    // Calculate velocity (pixels per millisecond)
    const velocity = deltaTime > 0 ? deltaScroll / deltaTime : 0;
    
    // Get element position
    const rect = elementRef.current.getBoundingClientRect();
    const elementY = rect.top + currentScrollY;
    
    // Calculate progress (0 to 1) based on element visibility
    const windowHeight = window.innerHeight;
    const elementHeight = rect.height;
    const elementTop = rect.top;
    const elementBottom = elementTop + elementHeight;
    
    let progress = 0;
    if (elementTop < windowHeight && elementBottom > 0) {
      const visibleHeight = Math.min(elementBottom, windowHeight) - Math.max(elementTop, 0);
      progress = Math.max(0, Math.min(1, visibleHeight / elementHeight));
    }

    // Apply physics-based smoothing if not reduced motion
    if (!prefersReducedMotion()) {
      const { damping, stiffness, mass } = finalConfig;
      const force = stiffness * (progress - scrollState.progress);
      const dampingForce = damping * velocity;
      const acceleration = (force - dampingForce) / mass;
      progress = scrollState.progress + velocity * deltaTime + 0.5 * acceleration * deltaTime * deltaTime;
    }

    setScrollState(prev => ({
      ...prev,
      scrollY: currentScrollY,
      elementY,
      progress: Math.max(0, Math.min(1, progress)),
      velocity,
    }));

    lastScrollY.current = currentScrollY;
    lastTime.current = currentTime;
  }, [finalConfig, scrollState.progress, prefersReducedMotion]);

  // Throttled scroll handler
  const handleScroll = useCallback(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }
    
    rafId.current = requestAnimationFrame(updateScrollPosition);
  }, [updateScrollPosition]);

  // Intersection Observer for visibility detection
  useEffect(() => {
    if (!elementRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setScrollState(prev => ({
            ...prev,
            isVisible: entry.isIntersecting,
          }));
        });
      },
      {
        threshold: finalConfig.threshold,
        rootMargin: finalConfig.rootMargin,
      }
    );

    observer.observe(elementRef.current);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [finalConfig.threshold, finalConfig.rootMargin]);

  // Scroll event listener
  useEffect(() => {
    // Initial scroll position
    updateScrollPosition();

    // Add scroll listener only if element is visible or might become visible
    const handleScrollEvent = () => {
      if (scrollState.isVisible || Math.abs(window.scrollY - lastScrollY.current) > 50) {
        handleScroll();
      }
    };

    window.addEventListener('scroll', handleScrollEvent, { passive: true });
    window.addEventListener('resize', updateScrollPosition, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScrollEvent);
      window.removeEventListener('resize', updateScrollPosition);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [handleScroll, updateScrollPosition, scrollState.isVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  // Animation helpers
  const getTransform = useCallback((
    translateY: number = 0,
    translateX: number = 0,
    scale: number = 1,
    rotate: number = 0
  ) => {
    if (prefersReducedMotion()) {
      return 'translateZ(0)'; // Only GPU acceleration
    }

    const smoothProgress = deferredProgress;
    
    const finalTranslateY = translateY * smoothProgress;
    const finalTranslateX = translateX * smoothProgress;
    const finalScale = 1 + (scale - 1) * smoothProgress;
    const finalRotate = rotate * smoothProgress;

    return `translate3d(${finalTranslateX}px, ${finalTranslateY}px, 0) scale(${finalScale}) rotate(${finalRotate}deg)`;
  }, [deferredProgress, deferredScrollY]);

  const getOpacity = useCallback((
    startOpacity: number = 0,
    endOpacity: number = 1
  ) => {
    if (prefersReducedMotion()) {
      return scrollState.isVisible ? endOpacity : startOpacity;
    }

    const smoothProgress = deferredProgress;
    return startOpacity + (endOpacity - startOpacity) * smoothProgress;
  }, [deferredProgress, scrollState.isVisible, prefersReducedMotion]);

  const getScale = useCallback((
    startScale: number = 0.8,
    endScale: number = 1
  ) => {
    if (prefersReducedMotion()) {
      return scrollState.isVisible ? endScale : startScale;
    }

    const smoothProgress = deferredProgress;
    return startScale + (endScale - startScale) * smoothProgress;
  }, [deferredProgress, scrollState.isVisible, prefersReducedMotion]);

  return {
    ref: elementRef,
    isVisible: scrollState.isVisible,
    scrollY: deferredScrollY,
    elementY: scrollState.elementY,
    progress: deferredProgress,
    velocity: scrollState.velocity,
    prefersReducedMotion: prefersReducedMotion(),
    
    // Animation helpers
    getTransform,
    getOpacity,
    getScale,
    
    // CSS properties for convenience
    style: {
      transform: getTransform(),
      opacity: getOpacity(),
      willChange: prefersReducedMotion() ? 'auto' : 'transform, opacity',
    },
  };
}

// Hook for parallax scrolling with performance optimizations
export function useParallaxScroll(speed: number = 0.5, config: ScrollAnimationConfig = {}) {
  const { ref, scrollY, isVisible, prefersReducedMotion } = useScrollAnimation(config);
  const deferredScrollY = useDeferredValue(scrollY);

  const parallaxTransform = useCallback(() => {
    if (prefersReducedMotion || !isVisible) {
      return 'translateZ(0)';
    }

    const offset = deferredScrollY * speed;
    return `translate3d(0, ${offset}px, 0)`;
  }, [deferredScrollY, speed, isVisible, prefersReducedMotion]);

  return {
    ref,
    isVisible,
    scrollY: deferredScrollY,
    transform: parallaxTransform(),
    style: {
      transform: parallaxTransform(),
      willChange: prefersReducedMotion ? 'auto' : 'transform',
    },
  };
}

// Hook for staggered animations
export function useStaggeredAnimation(
  _itemCount: number,
  staggerDelay: number = 100,
  config: ScrollAnimationConfig = {}
) {
  const { ref, isVisible, progress, prefersReducedMotion } = useScrollAnimation(config);
  const deferredProgress = useDeferredValue(progress);

  const getItemStyle = useCallback((index: number) => {
    if (prefersReducedMotion) {
      return {
        opacity: isVisible ? 1 : 0,
        transform: 'translateZ(0)',
      };
    }

    const delay = index * staggerDelay;
    const adjustedProgress = Math.max(0, Math.min(1, deferredProgress - delay / 1000));
    
    return {
      opacity: adjustedProgress,
      transform: `translate3d(0, ${(1 - adjustedProgress) * 20}px, 0)`,
      transitionDelay: `${delay}ms`,
      willChange: 'transform, opacity',
    };
  }, [deferredProgress, staggerDelay, isVisible, prefersReducedMotion]);

  return {
    ref,
    isVisible,
    progress: deferredProgress,
    getItemStyle,
  };
}