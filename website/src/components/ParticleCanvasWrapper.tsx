"use client";

import dynamic from 'next/dynamic';
import { Suspense, useEffect, useState, useDeferredValue } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const ParticleCanvas = dynamic(
  () => import('@/components/vfx/ParticleCanvas').then(mod => ({ default: mod.ParticleCanvas })),
  { 
    ssr: false,
    loading: () => <ParticleCanvasFallback />
  }
);

// Optimized fallback component
function ParticleCanvasFallback() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black opacity-50" />
  );
}

// Performance-optimized wrapper with viewport detection
export function ParticleCanvasWrapper() {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const deferredVisible = useDeferredValue(isVisible);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Intersection Observer for performance optimization
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsVisible(entry?.isIntersecting ?? false);
        
        // Delay rendering slightly to avoid jank
        if (entry?.isIntersecting) {
          const timer = setTimeout(() => setShouldRender(true), 100);
          return () => clearTimeout(timer);
        } else {
          // Keep rendering for a bit after leaving viewport for smooth transitions
          const timer = setTimeout(() => setShouldRender(false), 1000);
          return () => clearTimeout(timer);
        }
      },
      {
        threshold: 0,
        rootMargin: '100px 0px 100px 0px', // Start loading before visible
      }
    );

    // Create a dummy element to observe the viewport
    const dummyElement = document.createElement('div');
    dummyElement.style.position = 'fixed';
    dummyElement.style.top = '0';
    dummyElement.style.left = '0';
    dummyElement.style.width = '100%';
    dummyElement.style.height = '100%';
    dummyElement.style.pointerEvents = 'none';
    dummyElement.style.zIndex = '-1';
    
    document.body.appendChild(dummyElement);
    observer.observe(dummyElement);

    return () => {
      observer.disconnect();
      document.body.removeChild(dummyElement);
    };
  }, []);

  // Don't render particles if reduced motion is preferred
  if (prefersReducedMotion) {
    return <ParticleCanvasFallback />;
  }

  // Performance optimization: only render when visible or about to be visible
  if (!shouldRender && !deferredVisible) {
    return <ParticleCanvasFallback />;
  }

  return (
    <div 
      className="fixed inset-0 z-0 pointer-events-none"
      style={{
        opacity: deferredVisible ? 1 : 0,
        transition: 'opacity 0.5s ease-in-out',
        willChange: 'opacity',
      }}
    >
      <Suspense fallback={<ParticleCanvasFallback />}>
        <ParticleCanvas />
      </Suspense>
    </div>
  );
}

// Enhanced wrapper with scroll-based intensity
export function ParticleCanvasWrapperWithScrollEffect() {
  const { ref, scrollY } = useScrollAnimation({
    threshold: 0,
    rootMargin: '0px',
  });
  
  const [intensity, setIntensity] = useState(1);
  const deferredIntensity = useDeferredValue(intensity);

  // Adjust particle intensity based on scroll position
  useEffect(() => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollProgress = Math.min(scrollY / maxScroll, 1);
    
    // Reduce intensity as user scrolls down
    setIntensity(Math.max(0.2, 1 - scrollProgress * 0.8));
  }, [scrollY]);

  return (
    <div 
      ref={ref}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{
        opacity: deferredIntensity,
        transition: 'opacity 0.3s ease-out',
        willChange: 'opacity',
      }}
    >
      <ParticleCanvasWrapper />
    </div>
  );
}