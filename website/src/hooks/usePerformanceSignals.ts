'use client';

import { useEffect } from 'react';

export function usePerformanceSignals() {
  useEffect(() => {
    // Early return on server
    if (typeof window === 'undefined') return;

    let mounted = true;
    let frameCount = 0;
    let totalFrameTime = 0;
    let rafId: number;

    const setPerformanceLevel = (level: 'high' | 'low') => {
      if (mounted && document.documentElement) {
        document.documentElement.dataset.performance = level;
      }
    };

    // Check device capabilities
    const checkDeviceCapabilities = () => {
      const deviceMemory = (navigator as any).deviceMemory;
      const hardwareConcurrency = navigator.hardwareConcurrency;
      
      // Check for reduced motion preference
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      
      if (prefersReducedMotion) {
        return 'low';
      }
      
      // Low-end device heuristics
      if (deviceMemory && deviceMemory <= 4) {
        return 'low';
      }
      
      if (hardwareConcurrency && hardwareConcurrency <= 4) {
        return 'low';
      }
      
      return 'high';
    };

    // Sample frame times
    const sampleFrameTimes = () => {
      const startTime = performance.now();
      let lastTime = startTime;
      
      const measureFrame = () => {
        if (!mounted) return;
        
        const currentTime = performance.now();
        const frameTime = currentTime - lastTime;
        lastTime = currentTime;
        
        frameCount++;
        totalFrameTime += frameTime;
        
        // Sample for 1-2 seconds
        if (currentTime - startTime < 1500 && frameCount < 120) {
          rafId = requestAnimationFrame(measureFrame);
        } else {
          // Calculate average frame time
          const avgFrameTime = totalFrameTime / frameCount;
          
          // If average frame time > 16.7ms (60fps threshold), set to low
          const performanceLevel = avgFrameTime > 16.7 ? 'low' : checkDeviceCapabilities();
          setPerformanceLevel(performanceLevel);
        }
      };
      
      rafId = requestAnimationFrame(measureFrame);
    };

    // Listen for visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mounted) {
        // Re-sample when returning to visibility
        frameCount = 0;
        totalFrameTime = 0;
        sampleFrameTimes();
      }
    };

    // Listen for reduced motion changes
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionPreferenceChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setPerformanceLevel('low');
      } else {
        // Re-evaluate performance
        frameCount = 0;
        totalFrameTime = 0;
        sampleFrameTimes();
      }
    };

    // Initial evaluation
    const initialLevel = checkDeviceCapabilities();
    setPerformanceLevel(initialLevel);
    
    // Only sample frame times if not already determined to be low
    if (initialLevel === 'high') {
      sampleFrameTimes();
    }

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    mediaQuery.addEventListener('change', handleMotionPreferenceChange);

    return () => {
      mounted = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      mediaQuery.removeEventListener('change', handleMotionPreferenceChange);
    };
  }, []);
}