'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useReportWebVitals } from 'next/web-vitals';
import dynamic from 'next/dynamic';

interface WebVitalsMetric {
  id: string;
  name: string;
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
}

interface LoadingOptimizerProps {
  children: React.ReactNode;
  enablePrefetch?: boolean;
  enableServiceWorker?: boolean;
  enableWebVitals?: boolean;
}

// Lazy load performance monitoring components
const LazyPerformanceMonitor = dynamic(
  () => import('./PerformanceMonitor').then(mod => ({ default: mod.PerformanceMonitor })),
  { 
    ssr: false,
    loading: () => null 
  }
);

export function LoadingOptimizer({
  children,
  enablePrefetch = true,
  enableServiceWorker = true,
  enableWebVitals = true,
}: LoadingOptimizerProps) {
  const [metrics, setMetrics] = useState<WebVitalsMetric[]>([]);
  const [, setIsHydrated] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const performanceObserverRef = useRef<PerformanceObserver | null>(null);

  // Track Core Web Vitals
  useReportWebVitals((metric) => {
    if (enableWebVitals) {
      const rating = getMetricRating(metric.name, metric.value);
      setMetrics(prev => [...prev, { ...metric, rating }]);
      
      // Send to analytics (if configured)
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', metric.name, {
          value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
          metric_id: metric.id,
          metric_value: metric.value,
          metric_rating: rating,
        });
      }
    }
  });

  // Get rating for Core Web Vitals
  const getMetricRating = (name: string, value: number): 'good' | 'needs-improvement' | 'poor' => {
    const thresholds: Record<string, { good: number; poor: number }> = {
      LCP: { good: 2500, poor: 4000 },
      FID: { good: 100, poor: 300 },
      CLS: { good: 0.1, poor: 0.25 },
      FCP: { good: 1800, poor: 3000 },
      TTFB: { good: 800, poor: 1800 },
    };

    const threshold = thresholds[name];
    if (!threshold) return 'good';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.poor) return 'needs-improvement';
    return 'poor';
  };

  // Prefetch critical resources
  const prefetchResources = useCallback(() => {
    if (!enablePrefetch || typeof window === 'undefined') return;

    // Prefetch critical fonts
    const fonts = [
      '/fonts/inter-var.woff2',
      '/fonts/jetbrains-mono.woff2',
    ];

    fonts.forEach(font => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'font';
      link.type = 'font/woff2';
      link.crossOrigin = 'anonymous';
      link.href = font;
      document.head.appendChild(link);
    });

    // Preconnect to external domains
    const domains = [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
      'https://www.googletagmanager.com',
    ];

    domains.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = domain;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }, [enablePrefetch]);

  // Setup Intersection Observer for lazy loading
  const setupIntersectionObserver = useCallback(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            
            // Handle lazy loaded images
            if (target.dataset.src) {
              const img = target as HTMLImageElement;
              img.src = target.dataset.src;
              img.removeAttribute('data-src');
              observerRef.current?.unobserve(target);
            }

            // Handle lazy loaded components
            if (target.dataset.lazyComponent) {
              target.dispatchEvent(new CustomEvent('lazyload'));
              observerRef.current?.unobserve(target);
            }
          }
        });
      },
      {
        rootMargin: '50px 0px',
        threshold: 0.01,
      }
    );

    // Observe all lazy elements
    document.querySelectorAll('[data-src], [data-lazy-component]').forEach((el) => {
      observerRef.current?.observe(el);
    });
  }, []);

  // Setup Performance Observer
  const setupPerformanceObserver = useCallback(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      // Monitor long tasks
      performanceObserverRef.current = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            console.warn('Long task detected:', {
              duration: entry.duration,
              startTime: entry.startTime,
              name: entry.name,
            });
          }
        }
      });

      performanceObserverRef.current.observe({ entryTypes: ['longtask'] });

      // Monitor layout shifts
      const layoutShiftObserver = new PerformanceObserver((list) => {
        let clsValue = 0;
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        
        if (clsValue > 0.1) {
          console.warn('High CLS detected:', clsValue);
        }
      });

      layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (e) {
      console.error('Failed to setup performance observer:', e);
    }
  }, []);

  // Register Service Worker
  const registerServiceWorker = useCallback(async () => {
    if (!enableServiceWorker || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration);

        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }, [enableServiceWorker]);

  // Memory management utilities
  const cleanupMemory = useCallback(() => {
    // Clear image caches for offscreen images
    const images = document.querySelectorAll('img');
    images.forEach((img) => {
      const rect = img.getBoundingClientRect();
      const isOffscreen = rect.bottom < 0 || rect.top > window.innerHeight;
      
      if (isOffscreen && img.complete && img.src) {
        // Store original src
        img.dataset.cachedSrc = img.src;
        // Clear src to free memory
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      }
    });

    // Trigger garbage collection if available (Chrome DevTools)
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
    }
  }, []);

  // Monitor memory usage
  useEffect(() => {
    if (typeof window === 'undefined' || !('performance' in window)) return;

    const checkMemory = () => {
      const memory = (performance as any).memory;
      if (memory) {
        const usedMemoryMB = memory.usedJSHeapSize / 1048576;
        const totalMemoryMB = memory.totalJSHeapSize / 1048576;
        
        if (usedMemoryMB / totalMemoryMB > 0.9) {
          console.warn('High memory usage detected:', {
            used: `${usedMemoryMB.toFixed(2)} MB`,
            total: `${totalMemoryMB.toFixed(2)} MB`,
            percentage: `${((usedMemoryMB / totalMemoryMB) * 100).toFixed(2)}%`,
          });
          
          // Trigger cleanup
          cleanupMemory();
        }
      }
    };

    const memoryInterval = setInterval(checkMemory, 30000); // Check every 30 seconds

    return () => clearInterval(memoryInterval);
  }, [cleanupMemory]);

  // Initialize optimizations
  useEffect(() => {
    setIsHydrated(true);
    prefetchResources();
    setupIntersectionObserver();
    setupPerformanceObserver();
    registerServiceWorker();

    return () => {
      observerRef.current?.disconnect();
      performanceObserverRef.current?.disconnect();
    };
  }, [prefetchResources, setupIntersectionObserver, setupPerformanceObserver, registerServiceWorker]);

  // Provide optimization context (for future use)
  // const optimizationContext = {
  //   isHydrated,
  //   metrics,
  //   observer: observerRef.current,
  // };

  return (
    <>
      {children}
      {enableWebVitals && process.env.NODE_ENV === 'development' && (
        <LazyPerformanceMonitor metrics={metrics} />
      )}
    </>
  );
}

// Performance Monitor Component (shown in development)
export function InlinePerformanceMonitor({ metrics }: { metrics: WebVitalsMetric[] }) {
  const [isMinimized, setIsMinimized] = useState(false);

  if (metrics.length === 0) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg shadow-lg transition-all ${
        isMinimized ? 'w-12 h-12' : 'w-80'
      }`}
    >
      <button
        onClick={() => setIsMinimized(!isMinimized)}
        className="absolute top-2 right-2 text-xs"
      >
        {isMinimized ? '📊' : '➖'}
      </button>
      
      {!isMinimized && (
        <>
          <h3 className="text-sm font-bold mb-2">Web Vitals</h3>
          <div className="space-y-1">
            {metrics.slice(-5).map((metric) => (
              <div key={metric.id} className="flex justify-between text-xs">
                <span>{metric.name}</span>
                <span className={`font-mono ${
                  metric.rating === 'good' ? 'text-green-400' :
                  metric.rating === 'needs-improvement' ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {metric.name === 'CLS' 
                    ? metric.value.toFixed(3)
                    : `${Math.round(metric.value)}ms`
                  }
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Export optimization utilities
export { useOptimizedImage } from '../../hooks/useOptimizedImage';
export { useAnimationFrame } from '../../hooks/useAnimationFrame';
export { useLazyComponent } from '../../hooks/useLazyComponent';