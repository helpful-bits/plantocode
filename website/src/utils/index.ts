// Performance utilities export
export * from './performance';
import { performanceMonitor as perfMonitor, animationManager as animManager, memoryManager as memManager, serviceWorkerManager as swManager } from './performance';

// Re-export commonly used utilities
export {
  PerformanceMonitor,
  AnimationManager,
  MemoryManager,
  ImageOptimizer,
  BundleAnalyzer,
  ServiceWorkerManager,
  performanceMonitor,
  animationManager,
  memoryManager,
  serviceWorkerManager,
  debounce,
  throttle,
  measurePerformance,
  isSlowDevice,
  prefersReducedMotion,
} from './performance';

// Export performance hooks
export {
  useOptimizedImage,
  usePreloadImages,
} from '../hooks/useOptimizedImage';

export {
  useAnimationFrame,
  useAnimationLoop,
  useFrameState,
  useAnimatedTransition,
  useScrollAnimation,
  easingFunctions,
} from '../hooks/useAnimationFrame';

export {
  useLazyComponent,
  useLazyDynamicImport,
  useAdvancedLazyLoading,
} from '../hooks/useLazyComponent';

// Export lazy component utilities from UI components
export {
  withLazyLoading,
  createLazyComponent,
  LazyComponentWrapper,
} from '../components/ui/LazyComponent';


// Common performance constants
export const PERFORMANCE_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
} as const;

export const CACHE_NAMES = {
  static: 'vibe-manager-static-v1.0.0',
  dynamic: 'vibe-manager-dynamic-v1.0.0',
  images: 'vibe-manager-images-v1.0.0',
} as const;

export const DEVICE_BREAKPOINTS = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
} as const;

// Performance utility functions
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  
  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${minutes.toFixed(1)}m`;
  }
  
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  
  const width = window.innerWidth;
  
  if (width < DEVICE_BREAKPOINTS.mobile) return 'mobile';
  if (width < DEVICE_BREAKPOINTS.desktop) return 'tablet';
  return 'desktop';
}

export function getConnectionType(): 'slow' | 'fast' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  
  const connection = (navigator as any).connection;
  if (!connection) return 'unknown';
  
  const slowTypes = ['slow-2g', '2g', '3g'];
  if (slowTypes.includes(connection.effectiveType)) {
    return 'slow';
  }
  
  return 'fast';
}

export function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function shouldPreferDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 1920, height: 1080 };
  }
  
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function getScreenInfo(): {
  width: number;
  height: number;
  devicePixelRatio: number;
  colorDepth: number;
} {
  if (typeof window === 'undefined') {
    return {
      width: 1920,
      height: 1080,
      devicePixelRatio: 1,
      colorDepth: 24,
    };
  }
  
  return {
    width: window.screen.width,
    height: window.screen.height,
    devicePixelRatio: window.devicePixelRatio || 1,
    colorDepth: window.screen.colorDepth,
  };
}

// Performance monitoring utilities
export function startPerformanceMonitoring(): void {
  if (typeof window === 'undefined') return;
  
  // Start performance monitoring
  perfMonitor.subscribe((metrics: any) => {
    // Log metrics in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Performance metrics:', metrics);
    }
    
    // Send to analytics in production
    if (process.env.NODE_ENV === 'production' && window.gtag) {
      Object.entries(metrics).forEach(([key, value]) => {
        window.gtag!('event', 'performance_metric', {
          metric_name: key,
          value: Math.round(value as number),
        });
      });
    }
  });
  
  // Start memory monitoring
  memManager.startMemoryMonitoring();
  
  // Register service worker
  swManager.register();
}

export function stopPerformanceMonitoring(): void {
  perfMonitor.cleanup();
  animManager.clear();
}

// Initialize performance monitoring on import
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  startPerformanceMonitoring();
}

// Global performance utilities
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    performance: Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };
  }
}