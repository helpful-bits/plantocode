import { useCallback, useEffect, useRef } from 'react';
import { startTransition } from 'react';
import { AnimationManager, AnimationFrameOptions } from '../utils/performance';

interface UseAnimationFrameOptions extends AnimationFrameOptions {
  enabled?: boolean;
  autoStart?: boolean;
}

export function useAnimationFrame(
  callback: (timestamp: number) => void,
  options: UseAnimationFrameOptions = {}
) {
  const {
    enabled = true,
    autoStart = false,
    priority = 'medium',
    timeout = 16,
  } = options;

  const callbackRef = useRef(callback);
  const animationIdRef = useRef<string | null>(null);
  const animationManager = AnimationManager.getInstance();

  // Update callback ref
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const start = useCallback(() => {
    if (!enabled || animationIdRef.current) return;

    animationIdRef.current = `animation-${Date.now()}-${Math.random()}`;
    
    const animationCallback = (timestamp: number) => {
      if (callbackRef.current) {
        callbackRef.current(timestamp);
      }
    };

    animationManager.scheduleAnimation(
      animationIdRef.current,
      animationCallback,
      { priority, timeout }
    );
  }, [enabled, priority, timeout, animationManager]);

  const stop = useCallback(() => {
    if (animationIdRef.current) {
      animationManager.cancelAnimation(animationIdRef.current);
      animationIdRef.current = null;
    }
  }, [animationManager]);

  const restart = useCallback(() => {
    stop();
    start();
  }, [stop, start]);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart) {
      start();
    }

    return () => {
      stop();
    };
  }, [autoStart, start, stop]);

  return {
    start,
    stop,
    restart,
    isRunning: animationIdRef.current !== null,
  };
}

// Hook for continuous animation loop
export function useAnimationLoop(
  callback: (timestamp: number, deltaTime: number) => void,
  options: UseAnimationFrameOptions = {}
) {
  const lastTimestampRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const fpsRef = useRef<number>(0);

  const animationCallback = useCallback((timestamp: number) => {
    const deltaTime = timestamp - lastTimestampRef.current;
    lastTimestampRef.current = timestamp;

    // Calculate FPS
    frameCountRef.current++;
    if (frameCountRef.current % 60 === 0) {
      fpsRef.current = 1000 / (deltaTime || 16);
    }

    callback(timestamp, deltaTime);
  }, [callback]);

  const { start, stop, restart, isRunning } = useAnimationFrame(animationCallback, {
    ...options,
    autoStart: false,
  });

  // Enhanced start function that continues the loop
  const startLoop = useCallback(() => {
    const loopCallback = (timestamp: number) => {
      animationCallback(timestamp);
      
      if (isRunning) {
        requestAnimationFrame(loopCallback);
      }
    };

    start();
    requestAnimationFrame(loopCallback);
  }, [start, animationCallback, isRunning]);

  return {
    start: startLoop,
    stop,
    restart,
    isRunning,
    fps: fpsRef.current,
  };
}

// Hook for frame-based state updates with React 19 concurrent features
export function useFrameState<T>(
  initialValue: T,
  updater: (current: T, timestamp: number, deltaTime: number) => T,
  options: UseAnimationFrameOptions = {}
) {
  const [state, setState] = useState<T>(initialValue);
  const lastTimestampRef = useRef<number>(0);

  const animationCallback = useCallback((timestamp: number) => {
    const deltaTime = timestamp - lastTimestampRef.current;
    lastTimestampRef.current = timestamp;

    // Use React 19 concurrent features for state updates
    if (options.priority === 'low') {
      startTransition(() => {
        setState(current => updater(current, timestamp, deltaTime));
      });
    } else {
      setState(current => updater(current, timestamp, deltaTime));
    }
  }, [updater, options.priority]);

  const { start, stop, restart, isRunning } = useAnimationFrame(animationCallback, options);

  return {
    state,
    setState,
    start,
    stop,
    restart,
    isRunning,
  };
}

// Hook for smooth transitions with easing
export function useAnimatedTransition(
  from: number,
  to: number,
  duration: number,
  easing: (t: number) => number = (t) => t,
  options: UseAnimationFrameOptions = {}
) {
  const [value, setValue] = useState<number>(from);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const startTimeRef = useRef<number>(0);
  const startValueRef = useRef<number>(from);

  const animationCallback = useCallback((timestamp: number) => {
    if (startTimeRef.current === 0) {
      startTimeRef.current = timestamp;
      startValueRef.current = value;
    }

    const elapsed = timestamp - startTimeRef.current;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);
    
    const currentValue = startValueRef.current + (to - startValueRef.current) * easedProgress;
    setValue(currentValue);

    if (progress >= 1) {
      setIsAnimating(false);
      startTimeRef.current = 0;
    }
  }, [value, to, duration, easing]);

  const { start, stop } = useAnimationFrame(animationCallback, {
    ...options,
    enabled: isAnimating,
  });

  const startTransition = useCallback(() => {
    setIsAnimating(true);
    startTimeRef.current = 0;
    start();
  }, [start]);

  const stopTransition = useCallback(() => {
    setIsAnimating(false);
    stop();
    startTimeRef.current = 0;
  }, [stop]);

  // Auto-start when target value changes
  useEffect(() => {
    if (to !== value && !isAnimating) {
      startTransition();
    }
  }, [to, value, isAnimating, startTransition]);

  return {
    value,
    isAnimating,
    start: startTransition,
    stop: stopTransition,
  };
}

// Hook for performance-optimized scroll animations
export function useScrollAnimation(
  callback: (scrollY: number, deltaY: number) => void,
  options: UseAnimationFrameOptions = {}
) {
  const lastScrollYRef = useRef<number>(0);
  const ticking = useRef<boolean>(false);

  const handleScroll = useCallback(() => {
    if (!ticking.current) {
      const animationCallback = () => {
        const scrollY = window.scrollY;
        const deltaY = scrollY - lastScrollYRef.current;
        
        callback(scrollY, deltaY);
        
        lastScrollYRef.current = scrollY;
        ticking.current = false;
      };

      if (options.priority === 'low') {
        startTransition(() => {
          requestAnimationFrame(animationCallback);
        });
      } else {
        requestAnimationFrame(animationCallback);
      }
      
      ticking.current = true;
    }
  }, [callback, options.priority]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);
}

// Common easing functions
export const easingFunctions = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => --t * t * t + 1,
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: (t: number) => t * t * t * t,
  easeOutQuart: (t: number) => 1 - --t * t * t * t,
  easeInOutQuart: (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,
  easeInQuint: (t: number) => t * t * t * t * t,
  easeOutQuint: (t: number) => 1 + --t * t * t * t * t,
  easeInOutQuint: (t: number) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t,
};

// Import from React (for TypeScript)
import { useState } from 'react';