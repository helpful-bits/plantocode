/**
 * Network interceptor for centralized fetch error logging
 * Wraps the native fetch to log all network errors automatically
 */

import { logError } from './error-handling';
import { triggerGlobalAuthErrorHandler } from '@/utils/auth-error-handler';

// Store the original fetch
const originalFetch = window.fetch;

/**
 * Initialize the fetch interceptor
 * This should be called once at app initialization
 */
export function initializeFetchInterceptor(): void {
  // Only initialize once
  if ((window as any).__fetchInterceptorInitialized) {
    return;
  }

  window.fetch = async function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const startTime = performance.now();
    let url: string;
    
    try {
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input instanceof Request) {
        url = input.url;
      } else {
        url = 'unknown';
      }
    } catch {
      url = 'unknown';
    }

    try {
      const response = await originalFetch(input, init);
      
      if (response.status === 401) {
        triggerGlobalAuthErrorHandler();
      }
      
      // Log slow requests (> 5 seconds)
      const duration = performance.now() - startTime;
      if (duration > 5000) {
        console.warn(`Slow network request: ${init?.method || 'GET'} ${url} took ${duration.toFixed(0)}ms`);
      }
      
      // Log non-2xx responses as warnings (but not as errors since they're handled)
      if (!response.ok) {
        void logError(
          new Error(`HTTP ${response.status}: ${response.statusText}`),
          'Network Request Failed',
          {
            url,
            method: init?.method || 'GET',
            status: response.status,
            statusText: response.statusText,
            duration: `${duration.toFixed(0)}ms`,
            timestamp: new Date().toISOString(),
          }
        ).catch(() => {
          // Ignore logging failures
        });
      }
      
      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      // Log network errors centrally
      void logError(error, 'Network Request Error', {
        url,
        method: init?.method || 'GET',
        duration: `${duration.toFixed(0)}ms`,
        timestamp: new Date().toISOString(),
        headers: init?.headers ? Object.fromEntries(
          Object.entries(init.headers).filter(([key]) => 
            !key.toLowerCase().includes('auth') && 
            !key.toLowerCase().includes('token')
          )
        ) : undefined,
      }).catch(() => {
        // Ignore logging failures
      });
      
      // Re-throw to maintain existing error handling
      throw error;
    }
  };

  // Mark as initialized
  (window as any).__fetchInterceptorInitialized = true;
}

/**
 * Remove the fetch interceptor (for cleanup/testing)
 */
export function removeFetchInterceptor(): void {
  window.fetch = originalFetch;
  delete (window as any).__fetchInterceptorInitialized;
}