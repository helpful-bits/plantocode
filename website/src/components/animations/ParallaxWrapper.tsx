"use client";

import { useEffect, useRef, useState, useCallback, useDeferredValue } from 'react';
import { useParallax } from 'react-scroll-parallax';
import { cn } from '@/lib/utils';
import { useScrollAnimation, useParallaxScroll } from '@/hooks/useScrollAnimation';

interface ParallaxWrapperProps {
  children: React.ReactNode;
  speed?: number;
  offset?: number;
  className?: string;
  disabled?: boolean;
  enableOnlyForLargeScreens?: boolean;
  startScroll?: number;
  endScroll?: number;
  easing?: string;
  onEnter?: () => void;
  onExit?: () => void;
}

export function ParallaxWrapper({
  children,
  speed = -0.5,
  offset = 0,
  className,
  disabled = false,
  enableOnlyForLargeScreens = true,
  startScroll = 0,
  endScroll = 0,
  easing = 'easeOutQuad',
  onEnter,
  onExit,
}: ParallaxWrapperProps) {
  const [isLargeScreen, setIsLargeScreen] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const prevVisible = useRef(false);

  // Check screen size and reduced motion preference
  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024); // lg breakpoint
    };

    const checkReducedMotion = () => {
      setPrefersReducedMotion(
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    };

    checkScreenSize();
    checkReducedMotion();

    window.addEventListener('resize', checkScreenSize);
    
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    mediaQuery.addEventListener('change', checkReducedMotion);

    return () => {
      window.removeEventListener('resize', checkScreenSize);
      mediaQuery.removeEventListener('change', checkReducedMotion);
    };
  }, []);

  // Determine if parallax should be enabled
  const parallaxEnabled = !disabled && 
    !prefersReducedMotion && 
    (!enableOnlyForLargeScreens || isLargeScreen);

  // Use our custom parallax hook for better performance
  const { ref, style, isVisible } = useParallaxScroll(
    parallaxEnabled ? speed : 0,
    {
      threshold: 0.1,
      rootMargin: '0px 0px -10% 0px',
      reducedMotion: prefersReducedMotion,
    }
  );

  // Fallback to react-scroll-parallax for advanced easing
  const { ref: fallbackRef } = useParallax({
    speed: parallaxEnabled ? speed * 10 : 0, // Adjust multiplier for react-scroll-parallax
    startScroll,
    endScroll,
    easing: easing as any, // Type assertion needed due to library typing mismatch
  }) as { ref: React.RefObject<HTMLDivElement> };

  // Handle visibility callbacks
  useEffect(() => {
    if (isVisible !== prevVisible.current) {
      if (isVisible && onEnter) {
        onEnter();
      } else if (!isVisible && onExit) {
        onExit();
      }
      prevVisible.current = isVisible;
    }
  }, [isVisible, onEnter, onExit]);

  // Combine refs
  const combinedRef = useCallback((node: HTMLDivElement) => {
    if (ref.current) {
      ref.current = node;
    }
    if (fallbackRef.current) {
      fallbackRef.current = node;
    }
  }, [ref, fallbackRef]);

  return (
    <div
      ref={combinedRef}
      className={cn(
        'will-change-transform transform-gpu',
        parallaxEnabled && 'motion-safe:will-change-transform',
        className
      )}
      style={{
        ...style,
        transform: parallaxEnabled 
          ? style.transform 
          : 'translateZ(0)', // GPU acceleration only
        ...(offset && { transform: `${style.transform} translateY(${offset}px)` }),
      }}
    >
      {children}
    </div>
  );
}

// Advanced parallax component with multiple layers
interface ParallaxLayerProps {
  children: React.ReactNode;
  speed: number;
  depth?: number;
  className?: string;
}

export function ParallaxLayer({ 
  children, 
  speed, 
  depth = 0, 
  className 
}: ParallaxLayerProps) {
  const { ref, style, isVisible } = useParallaxScroll(speed);
  const deferredVisible = useDeferredValue(isVisible);

  return (
    <div
      ref={ref}
      className={cn(
        'absolute inset-0 will-change-transform transform-gpu',
        className
      )}
      style={{
        ...style,
        zIndex: depth,
        transform: `${style.transform} translateZ(${depth}px)`,
        opacity: deferredVisible ? 1 : 0,
        transition: 'opacity 0.3s ease-out',
      }}
    >
      {children}
    </div>
  );
}

// Multi-layer parallax container
interface ParallaxContainerProps {
  children: React.ReactNode;
  className?: string;
  height?: string;
}

export function ParallaxContainer({ 
  children, 
  className, 
  height = '100vh' 
}: ParallaxContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(height);

  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerHeight(`${entry.contentRect.height}px`);
        }
      });

      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden perspective-1000',
        className
      )}
      style={{
        height: containerHeight,
        transformStyle: 'preserve-3d',
      }}
    >
      {children}
    </div>
  );
}

// Scroll-triggered fade animation
interface ScrollFadeProps {
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  duration?: number;
  delay?: number;
  className?: string;
}

export function ScrollFade({ 
  children, 
  direction = 'up', 
  distance = 20, 
  duration = 0.6,
  delay = 0,
  className 
}: ScrollFadeProps) {
  const { ref, getOpacity, isVisible } = useScrollAnimation({
    threshold: 0.1,
    rootMargin: '0px 0px -10% 0px',
  });

  const getDirectionTransform = useCallback(() => {
    if (!isVisible) {
      switch (direction) {
        case 'up':
          return `translate3d(0, ${distance}px, 0)`;
        case 'down':
          return `translate3d(0, -${distance}px, 0)`;
        case 'left':
          return `translate3d(${distance}px, 0, 0)`;
        case 'right':
          return `translate3d(-${distance}px, 0, 0)`;
        default:
          return 'translate3d(0, 0, 0)';
      }
    }
    return 'translate3d(0, 0, 0)';
  }, [direction, distance, isVisible]);

  return (
    <div
      ref={ref}
      className={cn(
        'will-change-transform transform-gpu',
        className
      )}
      style={{
        transform: getDirectionTransform(),
        opacity: getOpacity(),
        transition: `transform ${duration}s ease-out ${delay}s, opacity ${duration}s ease-out ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// Scroll-based scale animation
interface ScrollScaleProps {
  children: React.ReactNode;
  startScale?: number;
  endScale?: number;
  className?: string;
}

export function ScrollScale({ 
  children, 
  startScale = 0.8, 
  endScale = 1,
  className 
}: ScrollScaleProps) {
  const { ref, getScale, getOpacity } = useScrollAnimation({
    threshold: 0.1,
    rootMargin: '0px 0px -10% 0px',
  });

  return (
    <div
      ref={ref}
      className={cn(
        'will-change-transform transform-gpu',
        className
      )}
      style={{
        transform: `scale(${getScale(startScale, endScale)})`,
        opacity: getOpacity(),
        transition: 'transform 0.6s ease-out, opacity 0.6s ease-out',
      }}
    >
      {children}
    </div>
  );
}

// Viewport-based sticky parallax
interface StickyParallaxProps {
  children: React.ReactNode;
  height?: string;
  speed?: number;
  className?: string;
}

export function StickyParallax({ 
  children, 
  height = '200vh', 
  speed = 0.5,
  className 
}: StickyParallaxProps) {
  const { ref, scrollY, isVisible } = useScrollAnimation();
  const [stickyOffset, setStickyOffset] = useState(0);

  useEffect(() => {
    if (ref.current && isVisible) {
      const rect = ref.current.getBoundingClientRect();
      const elementTop = rect.top + scrollY;
      const offset = (scrollY - elementTop) * speed;
      setStickyOffset(Math.max(0, offset));
    }
  }, [scrollY, isVisible, speed, ref]);

  return (
    <div
      ref={ref}
      className={cn('relative', className)}
      style={{ height }}
    >
      <div
        className="sticky top-0 will-change-transform transform-gpu"
        style={{
          transform: `translate3d(0, ${stickyOffset}px, 0)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}