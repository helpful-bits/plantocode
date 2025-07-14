'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useLazyComponent } from '@/hooks/useLazyComponent';

interface LazyComponentWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

/**
 * Wrapper component for lazy loading with intersection observer
 * 
 * @example
 * <LazyComponentWrapper fallback={<div>Loading...</div>}>
 *   <ExpensiveComponent />
 * </LazyComponentWrapper>
 */
export function LazyComponentWrapper({
  children,
  fallback = <div>Loading...</div>,
  threshold = 0.1,
  rootMargin = '50px',
  once = true,
}: LazyComponentWrapperProps) {
  const { isVisible, elementRef } = useLazyComponent({
    threshold,
    rootMargin,
    once,
  });
  const divRef = elementRef as React.RefObject<HTMLDivElement>;

  if (!isVisible) {
    return (
      <div ref={divRef} data-lazy-component="true">
        {fallback}
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Higher-order component for creating lazy-loaded components
 * 
 * @example
 * const LazyHero = withLazyLoading(() => import('./HeroSection'), {
 *   fallback: <HeroSkeleton />,
 * });
 */
export function withLazyLoading<P extends object>(
  importFn: () => Promise<{ default: React.ComponentType<P> }>,
  options: {
    fallback?: React.ReactNode;
    ssr?: boolean;
    threshold?: number;
    rootMargin?: string;
  } = {}
) {
  const { fallback = <div>Loading...</div>, ssr = false, threshold = 0.1, rootMargin = '50px' } = options;

  const DynamicComponent = dynamic(importFn, {
    ssr,
    loading: () => <>{fallback}</>,
  });

  return function LazyComponent(props: P) {
    const { isVisible, elementRef } = useLazyComponent({
      threshold,
      rootMargin,
      once: true,
    });
    const divRef = elementRef as React.RefObject<HTMLDivElement>;

    if (!isVisible) {
      return (
        <div ref={divRef} data-lazy-component="true">
          {fallback}
        </div>
      );
    }

    return <DynamicComponent {...props} />;
  };
}

/**
 * Create a lazy component with Next.js dynamic import
 * 
 * @example
 * const LazyChart = createLazyComponent(() => import('./Chart'), {
 *   fallback: <ChartSkeleton />,
 *   ssr: false,
 * });
 */
export function createLazyComponent<P extends object>(
  importFn: () => Promise<{ default: React.ComponentType<P> }>,
  options: {
    fallback?: React.ReactNode;
    ssr?: boolean;
  } = {}
) {
  const { fallback = <div>Loading...</div>, ssr = false } = options;

  return dynamic(importFn, {
    ssr,
    loading: () => <>{fallback}</>,
  });
}