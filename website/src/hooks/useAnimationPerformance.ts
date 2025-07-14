"use client";

import { useEffect, useRef, useState, useCallback } from 'react';

interface PerformanceMetrics {
  fps: number;
  averageFps: number;
  frameTime: number;
  isLowPerformance: boolean;
  memoryUsage?: number;
}

interface PerformanceConfig {
  targetFps?: number;
  lowPerformanceThreshold?: number;
  monitoringInterval?: number;
  enableMemoryMonitoring?: boolean;
}

const DEFAULT_CONFIG: Required<PerformanceConfig> = {
  targetFps: 60,
  lowPerformanceThreshold: 45,
  monitoringInterval: 1000,
  enableMemoryMonitoring: true,
};

export function useAnimationPerformance(config: PerformanceConfig = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    averageFps: 60,
    frameTime: 16.67,
    isLowPerformance: false,
  });

  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const fpsHistory = useRef<number[]>([]);
  const rafId = useRef<number | null>(null);
  const monitoringInterval = useRef<NodeJS.Timeout | null>(null);

  // Frame rate monitoring
  const measureFrameRate = useCallback(() => {
    const now = performance.now();
    const delta = now - lastTime.current;
    frameCount.current++;

    if (delta >= 1000) {
      const fps = (frameCount.current * 1000) / delta;
      fpsHistory.current.push(fps);
      
      // Keep only recent history
      if (fpsHistory.current.length > 10) {
        fpsHistory.current.shift();
      }

      const averageFps = fpsHistory.current.reduce((a, b) => a + b, 0) / fpsHistory.current.length;
      const frameTime = 1000 / fps;
      const isLowPerformance = fps < finalConfig.lowPerformanceThreshold;

      setMetrics(prev => ({
        ...prev,
        fps: Math.round(fps),
        averageFps: Math.round(averageFps),
        frameTime: Math.round(frameTime * 100) / 100,
        isLowPerformance,
      }));

      frameCount.current = 0;
      lastTime.current = now;
    }

    rafId.current = requestAnimationFrame(measureFrameRate);
  }, [finalConfig.lowPerformanceThreshold]);

  // Memory monitoring
  const measureMemoryUsage = useCallback(() => {
    if (finalConfig.enableMemoryMonitoring && 'memory' in performance) {
      const memInfo = (performance as any).memory;
      const memoryUsage = Math.round(memInfo.usedJSHeapSize / 1024 / 1024); // MB
      
      setMetrics(prev => ({
        ...prev,
        memoryUsage,
      }));
    }
  }, [finalConfig.enableMemoryMonitoring]);

  // Start monitoring
  useEffect(() => {
    rafId.current = requestAnimationFrame(measureFrameRate);
    
    if (finalConfig.enableMemoryMonitoring) {
      monitoringInterval.current = setInterval(measureMemoryUsage, finalConfig.monitoringInterval);
    }

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
      if (monitoringInterval.current) {
        clearInterval(monitoringInterval.current);
      }
    };
  }, [measureFrameRate, measureMemoryUsage, finalConfig.monitoringInterval, finalConfig.enableMemoryMonitoring]);

  // Performance optimization suggestions
  const getOptimizationSuggestions = useCallback(() => {
    const suggestions: string[] = [];

    if (metrics.fps < 30) {
      suggestions.push('Critical: FPS below 30 - consider reducing animation complexity');
    } else if (metrics.fps < finalConfig.lowPerformanceThreshold) {
      suggestions.push('Warning: FPS below target - consider performance optimizations');
    }

    if (metrics.memoryUsage && metrics.memoryUsage > 50) {
      suggestions.push('High memory usage detected - check for memory leaks');
    }

    if (metrics.frameTime > 20) {
      suggestions.push('Frame time high - consider using CSS transforms instead of JS animations');
    }

    return suggestions;
  }, [metrics, finalConfig.lowPerformanceThreshold]);

  // Adaptive performance settings
  const getAdaptiveSettings = useCallback(() => {
    const settings = {
      shouldReduceParticles: metrics.fps < 45,
      shouldDisableParallax: metrics.fps < 30,
      shouldReduceAnimationComplexity: metrics.fps < 40,
      recommendedParticleCount: Math.max(1000, Math.min(15000, metrics.fps * 250)),
    };

    return settings;
  }, [metrics.fps]);

  return {
    metrics,
    optimizationSuggestions: getOptimizationSuggestions(),
    adaptiveSettings: getAdaptiveSettings(),
    isMonitoring: !!rafId.current,
  };
}

// Hook for adaptive animation quality
export function useAdaptiveAnimationQuality() {
  const { metrics, adaptiveSettings } = useAnimationPerformance();
  const [animationQuality, setAnimationQuality] = useState<'high' | 'medium' | 'low'>('high');

  useEffect(() => {
    if (metrics.fps < 30) {
      setAnimationQuality('low');
    } else if (metrics.fps < 45) {
      setAnimationQuality('medium');
    } else {
      setAnimationQuality('high');
    }
  }, [metrics.fps]);

  const getQualitySettings = useCallback(() => {
    switch (animationQuality) {
      case 'low':
        return {
          particleCount: 2000,
          enableParallax: false,
          enableComplexAnimations: false,
          frameRate: 30,
        };
      case 'medium':
        return {
          particleCount: 8000,
          enableParallax: true,
          enableComplexAnimations: false,
          frameRate: 45,
        };
      case 'high':
      default:
        return {
          particleCount: 15000,
          enableParallax: true,
          enableComplexAnimations: true,
          frameRate: 60,
        };
    }
  }, [animationQuality]);

  return {
    animationQuality,
    qualitySettings: getQualitySettings(),
    metrics,
    adaptiveSettings,
  };
}

// Note: The PerformanceMonitor component has been moved to
// src/components/performance/PerformanceMonitor.tsx to avoid TypeScript errors
// in a pure hook file. Import it from there if needed.