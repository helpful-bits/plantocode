// Unified timing orchestration hooks - COMPLETELY STABILIZED
'use client';

import { useState, useEffect, useRef } from 'react';

// Timer types
type TimerRef = ReturnType<typeof setTimeout>;

// Easing function type
type EasingFunction = (t: number) => number;

// Default linear easing
const linearEasing: EasingFunction = (t: number) => t;

// useTimedLoop - SIMPLE and STABLE
interface UseTimedLoopOptions {
  idleDelayMs?: number;
  resetOnDeactivate?: boolean;
  onLoopStart?: () => void;
  onLoopEnd?: () => void;
}

interface UseTimedLoopReturn {
  t: number; // 0..1 progress through current loop
  loopCount: number;
  isRunning: boolean;
  restart(): void;
}

export function useTimedLoop(
  isActive: boolean,
  loopMs: number,
  options?: UseTimedLoopOptions
): UseTimedLoopReturn {
  const [t, setT] = useState(0);
  const [loopCount, setLoopCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  
  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<TimerRef | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) {
      // Clean up
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsRunning(false);
      if (options?.resetOnDeactivate) {
        setT(0);
        setLoopCount(0);
      }
      return;
    }

    // Reset on activate
    setT(0);
    setLoopCount(0);
    startTimeRef.current = null;

    const animate = () => {
      const now = performance.now();
      if (!startTimeRef.current) {
        startTimeRef.current = now;
      }

      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / loopMs, 1);
      
      setT(progress);
      
      if (progress >= 1) {
        options?.onLoopEnd?.();
        setLoopCount(prev => prev + 1);
        startTimeRef.current = now;
        setT(0);
        options?.onLoopStart?.();
      }
      
      if (isActive) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    const start = () => {
      setIsRunning(true);
      options?.onLoopStart?.();
      startTimeRef.current = performance.now();
      animate();
    };

    if (options?.idleDelayMs) {
      timeoutRef.current = setTimeout(start, options.idleDelayMs);
    } else {
      start();
    }

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isActive, loopMs, options?.idleDelayMs, options?.onLoopStart, options?.onLoopEnd, options?.resetOnDeactivate]);

  return {
    t,
    loopCount,
    isRunning,
    restart: () => {
      setT(0);
      setLoopCount(0);
      startTimeRef.current = null;
    }
  };
}

// useTimedCycle - SIMPLE and STABLE
interface UseTimedCycleOptions {
  active: boolean;
  phases: Array<{ name: string; durationMs: number }>;
  loop?: boolean;
  resetOnDeactivate?: boolean;
}

interface UseTimedCycleReturn {
  phaseName: string;
  phaseIndex: number;
  phaseElapsedMs: number;
  phaseProgress01: number;
  cycleElapsedMs: number;
  cycleProgress01: number;
  tick: number;
  isActive: boolean;
  restart(): void;
}

export function useTimedCycle(options: UseTimedCycleOptions): UseTimedCycleReturn {
  const { active, phases, loop = true, resetOnDeactivate = false } = options;
  const [phaseIndex, setPhaseIndex] = useState(0);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const cycleStartRef = useRef<number | null>(null);
  const phaseStartRef = useRef<number | null>(null);
  const currentPhaseIndexRef = useRef(0);
  const activeRef = useRef(active);
  const wasInactiveRef = useRef(!active);

  // Update refs
  activeRef.current = active;

  // Initialize immediately if active on first render
  if (!intervalRef.current && active) {
    currentPhaseIndexRef.current = 0;
    setPhaseIndex(0);
    cycleStartRef.current = Date.now();
    phaseStartRef.current = Date.now();
    wasInactiveRef.current = false;
  }

  // Start interval immediately on first render - runs continuously
  if (!intervalRef.current) {
    intervalRef.current = setInterval(() => {
      // Check if we just became active
      if (activeRef.current && wasInactiveRef.current) {
        // Reset on activation
        currentPhaseIndexRef.current = 0;
        setPhaseIndex(0);
        cycleStartRef.current = Date.now();
        phaseStartRef.current = Date.now();
        wasInactiveRef.current = false;
      }
      
      // Check if we just became inactive
      if (!activeRef.current && !wasInactiveRef.current) {
        if (resetOnDeactivate) {
          currentPhaseIndexRef.current = 0;
          setPhaseIndex(0);
          cycleStartRef.current = null;
          phaseStartRef.current = null;
        }
        wasInactiveRef.current = true;
        return; // Don't process when inactive
      }

      // Only process when active
      if (!activeRef.current) return;

      const now = Date.now();
      const currentPhaseData = phases[currentPhaseIndexRef.current];
      
      if (!currentPhaseData || !phaseStartRef.current) return;
      
      const phaseElapsed = now - phaseStartRef.current;

      // Check if current phase is complete
      if (phaseElapsed >= currentPhaseData.durationMs) {
        if (currentPhaseIndexRef.current < phases.length - 1) {
          // Move to next phase
          currentPhaseIndexRef.current++;
          setPhaseIndex(currentPhaseIndexRef.current);
          phaseStartRef.current = now;
        } else if (loop) {
          // Loop back to first phase
          currentPhaseIndexRef.current = 0;
          setPhaseIndex(0);
          cycleStartRef.current = now;
          phaseStartRef.current = now;
        }
      }
    }, 50); // 50ms = 20fps
  }

  // Calculate current values without causing re-renders
  const now = Date.now();
  const currentPhase = phases[phaseIndex];
  const phaseElapsed = phaseStartRef.current && active ? now - phaseStartRef.current : 0;
  const cycleElapsed = cycleStartRef.current && active ? now - cycleStartRef.current : 0;
  
  const phaseProgress01 = currentPhase && active ? Math.min(phaseElapsed / currentPhase.durationMs, 1) : 0;
  const totalCycleDuration = phases.reduce((sum, phase) => sum + phase.durationMs, 0);
  const cycleProgress01 = totalCycleDuration > 0 && active ? Math.min(cycleElapsed / totalCycleDuration, 1) : 0;

  // Minimal useEffect only for cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return {
    phaseName: currentPhase?.name || '',
    phaseIndex,
    phaseElapsedMs: phaseElapsed,
    phaseProgress01,
    cycleElapsedMs: cycleElapsed,
    cycleProgress01,
    tick: 0, // Remove tick to prevent re-renders
    isActive: active,
    restart: () => {
      setPhaseIndex(0);
      currentPhaseIndexRef.current = 0;
      cycleStartRef.current = Date.now();
      phaseStartRef.current = Date.now();
    }
  };
}

// useTypewriter - SIMPLE and STABLE
interface UseTypewriterOptions {
  active: boolean;
  text: string;
  durationMs: number;
  loop?: boolean;
}

interface UseTypewriterReturn {
  displayText: string;
  isDone: boolean;
}

export function useTypewriter(options: UseTypewriterOptions): UseTypewriterReturn {
  const { active, text, durationMs, loop = false } = options;
  const [displayText, setDisplayText] = useState('');
  const [isDone, setIsDone] = useState(false);

  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const loopTimeoutRef = useRef<TimerRef | null>(null);
  const prevActiveRef = useRef(active);
  const prevTextRef = useRef(text);
  const prevDurationRef = useRef(durationMs);
  const prevLoopRef = useRef(loop);

  useEffect(() => {
    const activeChanged = prevActiveRef.current !== active;
    const textChanged = prevTextRef.current !== text;
    const durationChanged = prevDurationRef.current !== durationMs;
    const loopChanged = prevLoopRef.current !== loop;
    
    // Only restart if something meaningful changed
    const shouldRestart = activeChanged || (active && (textChanged || durationChanged || loopChanged));
    
    if (!shouldRestart) {
      prevActiveRef.current = active;
      prevTextRef.current = text;
      prevDurationRef.current = durationMs;
      prevLoopRef.current = loop;
      return;
    }

    // Clean up any existing animation
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = null;
    }

    if (!active) {
      setDisplayText('');
      setIsDone(false);
      startTimeRef.current = null;
      prevActiveRef.current = active;
      prevTextRef.current = text;
      prevDurationRef.current = durationMs;
      prevLoopRef.current = loop;
      return;
    }

    // Reset on activate
    setDisplayText('');
    setIsDone(false);
    startTimeRef.current = null;

    const animate = () => {
      const now = performance.now();
      
      if (!startTimeRef.current) {
        startTimeRef.current = now;
      }

      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const targetLength = Math.floor(progress * text.length);
      
      setDisplayText(text.slice(0, targetLength));
      
      if (progress >= 1) {
        setIsDone(true);
        if (loop) {
          loopTimeoutRef.current = setTimeout(() => {
            if (active) {
              startTimeRef.current = null;
              setIsDone(false);
              setDisplayText('');
              frameRef.current = requestAnimationFrame(animate);
            }
          }, 500);
          return;
        }
      }

      if (active && progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    animate();
    
    // Update refs after successful start
    prevActiveRef.current = active;
    prevTextRef.current = text;
    prevDurationRef.current = durationMs;
    prevLoopRef.current = loop;

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
    };
  }, [active, text, durationMs, loop]);

  return { displayText, isDone };
}

// useTweenNumber - SIMPLE and STABLE
interface UseTweenNumberOptions {
  active: boolean;
  from: number;
  to: number;
  durationMs: number;
  easing?: EasingFunction;
  loop?: boolean;
}

interface UseTweenNumberReturn {
  value: number;
  isDone: boolean;
}

export function useTweenNumber(options: UseTweenNumberOptions): UseTweenNumberReturn {
  const { active, from, to, durationMs, easing = linearEasing, loop = false } = options;
  const [value, setValue] = useState(from);
  const [isDone, setIsDone] = useState(false);

  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const loopTimeoutRef = useRef<TimerRef | null>(null);

  useEffect(() => {
    if (!active) {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
      setValue(from);
      setIsDone(false);
      startTimeRef.current = null;
      return;
    }

    // Reset on activate
    setValue(from);
    setIsDone(false);
    startTimeRef.current = null;

    const animate = () => {
      const now = performance.now();
      
      if (!startTimeRef.current) {
        startTimeRef.current = now;
      }

      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const easedProgress = easing(progress);
      
      setValue(from + (to - from) * easedProgress);
      
      if (progress >= 1) {
        setIsDone(true);
        if (loop) {
          loopTimeoutRef.current = setTimeout(() => {
            if (active) {
              startTimeRef.current = null;
              setIsDone(false);
              setValue(from);
              frameRef.current = requestAnimationFrame(animate);
            }
          }, 100);
          return;
        }
      }

      if (active && progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    animate();

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
    };
  }, [active, from, to, durationMs, easing, loop]);

  return { value, isDone };
}

// useIntervalGate - window-based gating function
interface TimeWindow {
  startPct: number;
  endPct: number;
}

export function useIntervalGate(t: number, windows: TimeWindow[]): boolean {
  return windows.some(window => t >= window.startPct && t <= window.endPct);
}

