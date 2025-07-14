import { useEffect, useRef, useState } from 'react';
import { ImageOptimizer } from '../utils/performance';

interface UseOptimizedImageOptions {
  src: string;
  placeholder?: string;
  quality?: number;
  priority?: boolean;
  sizes?: string;
  onLoad?: () => void;
  onError?: () => void;
}

interface UseOptimizedImageReturn {
  src: string;
  isLoading: boolean;
  isError: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
}

export function useOptimizedImage({
  src,
  placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  quality = 80,
  priority = false,
  sizes,
  onLoad,
  onError,
}: UseOptimizedImageOptions): UseOptimizedImageReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(placeholder);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!src) return;

    const img = imgRef.current;
    if (!img) return;

    // Set initial state
    setIsLoading(true);
    setIsError(false);
    setCurrentSrc(placeholder);

    // Generate optimized src with quality and format
    const optimizedSrc = generateOptimizedSrc(src, quality, sizes);

    if (priority) {
      // Load immediately for priority images
      loadImage(optimizedSrc);
    } else {
      // Use intersection observer for lazy loading
      img.dataset.src = optimizedSrc;
      ImageOptimizer.observeImage(img);
    }

    function loadImage(imageSrc: string) {
      const tempImg = new Image();
      
      tempImg.onload = () => {
        setCurrentSrc(imageSrc);
        setIsLoading(false);
        onLoad?.();
      };
      
      tempImg.onerror = () => {
        setIsError(true);
        setIsLoading(false);
        onError?.();
      };
      
      tempImg.src = imageSrc;
    }

    // Handle intersection observer callback
    const handleLazyLoad = () => {
      loadImage(optimizedSrc);
    };

    if (img && !priority) {
      img.addEventListener('lazyload', handleLazyLoad);
    }

    return () => {
      if (img && !priority) {
        img.removeEventListener('lazyload', handleLazyLoad);
      }
    };
  }, [src, placeholder, quality, priority, sizes, onLoad, onError]);

  return {
    src: currentSrc,
    isLoading,
    isError,
    imgRef,
  };
}

function generateOptimizedSrc(src: string, quality: number, sizes?: string): string {
  if (!src.startsWith('/_next/image')) {
    return src;
  }

  const url = new URL(src, window.location.origin);
  
  // Add quality parameter
  url.searchParams.set('q', quality.toString());
  
  // Add width based on sizes or screen width
  if (sizes) {
    const width = extractWidthFromSizes(sizes);
    if (width) {
      url.searchParams.set('w', width.toString());
    }
  } else {
    // Use screen width as fallback
    const screenWidth = window.innerWidth;
    const dpr = window.devicePixelRatio || 1;
    const optimalWidth = Math.round(screenWidth * dpr);
    url.searchParams.set('w', optimalWidth.toString());
  }

  // Add format parameter for modern browsers
  if (supportsWebP()) {
    url.searchParams.set('f', 'webp');
  } else if (supportsAVIF()) {
    url.searchParams.set('f', 'avif');
  }

  return url.toString();
}

function extractWidthFromSizes(sizes: string): number | null {
  // Extract the largest width from sizes string
  const matches = sizes.match(/(\d+)px/g);
  if (!matches) return null;

  const widths = matches.map(match => parseInt(match.replace('px', ''), 10));
  return Math.max(...widths);
}

function supportsWebP(): boolean {
  if (typeof window === 'undefined') return false;
  
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
}

function supportsAVIF(): boolean {
  if (typeof window === 'undefined') return false;
  
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  
  try {
    return canvas.toDataURL('image/avif').indexOf('data:image/avif') === 0;
  } catch {
    return false;
  }
}

// Preload critical images hook
export function usePreloadImages(urls: string[], priority = false) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!urls.length) return;

    if (priority) {
      // Preload immediately for priority images
      ImageOptimizer.preloadCriticalImages(urls)
        .then(() => setIsLoaded(true))
        .catch(setError);
    } else {
      // Preload on idle
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          ImageOptimizer.preloadCriticalImages(urls)
            .then(() => setIsLoaded(true))
            .catch(setError);
        });
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => {
          ImageOptimizer.preloadCriticalImages(urls)
            .then(() => setIsLoaded(true))
            .catch(setError);
        }, 0);
      }
    }
  }, [urls, priority]);

  return { isLoaded, error };
}