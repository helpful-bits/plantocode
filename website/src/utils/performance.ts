import { startTransition } from 'react';

// Types for performance monitoring
export interface PerformanceMetrics {
  lcp: number;
  fid: number;
  cls: number;
  fcp: number;
  ttfb: number;
  renderTime: number;
  loadTime: number;
}

export interface AnimationFrameOptions {
  priority?: 'high' | 'medium' | 'low';
  timeout?: number;
}

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

// Performance monitoring utilities
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Partial<PerformanceMetrics> = {};
  private observers: PerformanceObserver[] = [];
  private callbacks: Set<(metrics: Partial<PerformanceMetrics>) => void> = new Set();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  constructor() {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      this.initializeObservers();
    }
  }

  private initializeObservers(): void {
    // LCP Observer
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        this.updateMetric('lcp', lastEntry.renderTime || lastEntry.loadTime);
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(lcpObserver);
    } catch (e) {
      console.warn('LCP observer not supported');
    }

    // FID Observer
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          this.updateMetric('fid', entry.processingStart - entry.startTime);
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
      this.observers.push(fidObserver);
    } catch (e) {
      console.warn('FID observer not supported');
    }

    // CLS Observer
    try {
      const clsObserver = new PerformanceObserver((list) => {
        let clsValue = 0;
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        this.updateMetric('cls', clsValue);
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(clsObserver);
    } catch (e) {
      console.warn('CLS observer not supported');
    }

    // FCP Observer
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (entry.name === 'first-contentful-paint') {
            this.updateMetric('fcp', entry.startTime);
          }
        });
      });
      fcpObserver.observe({ entryTypes: ['paint'] });
      this.observers.push(fcpObserver);
    } catch (e) {
      console.warn('FCP observer not supported');
    }

    // Navigation timing
    if (typeof window !== 'undefined' && window.performance?.timing) {
      const timing = window.performance.timing;
      this.updateMetric('ttfb', timing.responseStart - timing.navigationStart);
      this.updateMetric('loadTime', timing.loadEventEnd - timing.navigationStart);
    }
  }

  private updateMetric(key: keyof PerformanceMetrics, value: number): void {
    this.metrics[key] = value;
    this.notifyCallbacks();
  }

  private notifyCallbacks(): void {
    this.callbacks.forEach(callback => callback(this.metrics));
  }

  public subscribe(callback: (metrics: Partial<PerformanceMetrics>) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  public getMetrics(): Partial<PerformanceMetrics> {
    return { ...this.metrics };
  }

  public cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.callbacks.clear();
  }
}

// Animation frame utilities with React 19 concurrent features
export class AnimationManager {
  private static instance: AnimationManager;
  private animationQueue: Map<string, {
    callback: FrameRequestCallback;
    options: AnimationFrameOptions;
    startTime: number;
  }> = new Map();

  private rafId: number | null = null;
  private isRunning = false;

  static getInstance(): AnimationManager {
    if (!AnimationManager.instance) {
      AnimationManager.instance = new AnimationManager();
    }
    return AnimationManager.instance;
  }

  public scheduleAnimation(
    id: string,
    callback: FrameRequestCallback,
    options: AnimationFrameOptions = {}
  ): void {
    const { priority = 'medium', timeout = 16 } = options;

    this.animationQueue.set(id, {
      callback,
      options: { priority, timeout },
      startTime: performance.now(),
    });

    if (!this.isRunning) {
      this.startAnimationLoop();
    }
  }

  public cancelAnimation(id: string): void {
    this.animationQueue.delete(id);
    
    if (this.animationQueue.size === 0 && this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
      this.isRunning = false;
    }
  }

  private startAnimationLoop(): void {
    this.isRunning = true;
    
    const loop = (timestamp: number) => {
      if (this.animationQueue.size === 0) {
        this.isRunning = false;
        return;
      }

      // Sort by priority
      const sortedAnimations = Array.from(this.animationQueue.entries())
        .sort(([, a], [, b]) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.options.priority!] - priorityOrder[b.options.priority!];
        });

      // Process animations with time slicing
      const frameTimeLimit = 5; // 5ms per frame
      const frameStart = performance.now();

      for (const [id, { callback, options, startTime }] of sortedAnimations) {
        // Check timeout
        if (timestamp - startTime > (options.timeout || 16)) {
          this.animationQueue.delete(id);
          continue;
        }

        // Time slice check
        if (performance.now() - frameStart > frameTimeLimit) {
          break;
        }

        // Use React 19 concurrent features for low-priority animations
        if (options.priority === 'low') {
          startTransition(() => {
            callback(timestamp);
          });
        } else {
          callback(timestamp);
        }

        this.animationQueue.delete(id);
      }

      if (this.animationQueue.size > 0) {
        this.rafId = requestAnimationFrame(loop);
      } else {
        this.isRunning = false;
      }
    };

    this.rafId = requestAnimationFrame(loop);
  }

  public clear(): void {
    this.animationQueue.clear();
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isRunning = false;
  }
}

// Memory management utilities
export class MemoryManager {
  private static instance: MemoryManager;
  private memoryThreshold = 0.8; // 80% threshold
  private cleanupCallbacks: Set<() => void> = new Set();

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  public getMemoryInfo(): MemoryInfo | null {
    if (typeof window === 'undefined' || !(performance as any).memory) {
      return null;
    }

    const memory = (performance as any).memory;
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };
  }

  public getMemoryUsagePercentage(): number {
    const memory = this.getMemoryInfo();
    if (!memory) return 0;

    return (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100;
  }

  public isMemoryPressure(): boolean {
    const usage = this.getMemoryUsagePercentage();
    return usage > this.memoryThreshold * 100;
  }

  public registerCleanupCallback(callback: () => void): () => void {
    this.cleanupCallbacks.add(callback);
    return () => this.cleanupCallbacks.delete(callback);
  }

  public forceCleanup(): void {
    this.cleanupCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error during memory cleanup:', error);
      }
    });

    // Force garbage collection if available
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
    }
  }

  public startMemoryMonitoring(interval = 30000): () => void {
    const intervalId = setInterval(() => {
      if (this.isMemoryPressure()) {
        console.warn('Memory pressure detected, triggering cleanup');
        this.forceCleanup();
      }
    }, interval);

    return () => clearInterval(intervalId);
  }
}

// Image optimization utilities
export class ImageOptimizer {
  private static loadedImages = new Map<string, HTMLImageElement>();
  private static observer: IntersectionObserver | null = null;

  static initializeObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            this.loadImage(img);
            this.observer?.unobserve(img);
          }
        });
      },
      {
        rootMargin: '50px 0px',
        threshold: 0.01,
      }
    );
  }

  static loadImage(img: HTMLImageElement): void {
    const src = img.dataset.src || img.src;
    if (!src) return;

    if (this.loadedImages.has(src)) {
      const cachedImg = this.loadedImages.get(src)!;
      img.src = cachedImg.src;
      img.classList.remove('loading');
      return;
    }

    const tempImg = new Image();
    tempImg.onload = () => {
      img.src = tempImg.src;
      img.classList.remove('loading');
      this.loadedImages.set(src, tempImg);
    };
    tempImg.onerror = () => {
      img.classList.add('error');
      img.classList.remove('loading');
    };
    tempImg.src = src;
  }

  static observeImage(img: HTMLImageElement): void {
    if (!this.observer) {
      this.initializeObserver();
    }
    
    img.classList.add('loading');
    this.observer?.observe(img);
  }

  static preloadCriticalImages(urls: string[]): Promise<void[]> {
    const promises = urls.map(url => {
      return new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          this.loadedImages.set(url, img);
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });
    });

    return Promise.all(promises);
  }

  static clearCache(): void {
    this.loadedImages.clear();
  }
}

// Bundle analysis utilities
export class BundleAnalyzer {
  static analyzeChunks(): void {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') {
      return;
    }

    const chunks = (window as any).__NEXT_DATA__?.chunks || [];
    const totalSize = chunks.reduce((sum: number, chunk: any) => {
      return sum + (chunk.size || 0);
    }, 0);

    console.group('Bundle Analysis');
    console.log('Total bundle size:', (totalSize / 1024).toFixed(2) + 'KB');
    console.log('Number of chunks:', chunks.length);
    
    chunks
      .sort((a: any, b: any) => (b.size || 0) - (a.size || 0))
      .slice(0, 10)
      .forEach((chunk: any) => {
        console.log(`${chunk.name}: ${(chunk.size / 1024).toFixed(2)}KB`);
      });
    
    console.groupEnd();
  }

  static measureComponentRenderTime(componentName: string, renderFn: () => void): void {
    const startTime = performance.now();
    renderFn();
    const endTime = performance.now();
    
    console.log(`${componentName} render time: ${(endTime - startTime).toFixed(2)}ms`);
  }
}

// Service Worker utilities
export class ServiceWorkerManager {
  private static instance: ServiceWorkerManager;
  private registration: ServiceWorkerRegistration | null = null;

  static getInstance(): ServiceWorkerManager {
    if (!ServiceWorkerManager.instance) {
      ServiceWorkerManager.instance = new ServiceWorkerManager();
    }
    return ServiceWorkerManager.instance;
  }

  async register(swPath = '/sw.js'): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    try {
      this.registration = await navigator.serviceWorker.register(swPath);
      
      // Handle updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration?.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              this.notifyUpdate();
            }
          });
        }
      });

      return this.registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }

  async unregister(): Promise<boolean> {
    if (this.registration) {
      return await this.registration.unregister();
    }
    return false;
  }

  async update(): Promise<void> {
    if (this.registration) {
      await this.registration.update();
    }
  }

  private notifyUpdate(): void {
    if (typeof window !== 'undefined' && window.confirm) {
      const shouldUpdate = window.confirm('A new version is available. Reload to update?');
      if (shouldUpdate) {
        window.location.reload();
      }
    }
  }
}

// Utility functions
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function measurePerformance<T>(
  name: string,
  fn: () => T
): T {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  console.log(`${name}: ${(end - start).toFixed(2)}ms`);
  return result;
}

export function isSlowDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  
  // Check for slow connection
  const connection = (navigator as any).connection;
  if (connection && connection.effectiveType) {
    return connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
  }
  
  // Check for low memory
  const memory = (navigator as any).deviceMemory;
  if (memory && memory < 4) {
    return true;
  }
  
  return false;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Initialize singletons
export const performanceMonitor = PerformanceMonitor.getInstance();
export const animationManager = AnimationManager.getInstance();
export const memoryManager = MemoryManager.getInstance();
export const serviceWorkerManager = ServiceWorkerManager.getInstance();

// Classes are already exported above, no need to re-export them