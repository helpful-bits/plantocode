/**
 * Utility functions for asynchronous operations
 */

import { ErrorType, createError } from "./error-handling";
// Debounce functionality has been removed

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxAttempts?: number;
  delays?: number[];
  exponentialBackoff?: boolean;
  baseDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
  onRetry?: (error: any, attempt: number, delay: number) => void;
}

/**
 * Creates a promise that resolves after the specified timeout
 * @param ms Timeout in milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a promise that rejects after the specified timeout
 * @param ms Timeout in milliseconds
 * @param message Optional error message
 */
export function timeout(ms: number, message = `Operation timed out after ${ms}ms`): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(createError(message, ErrorType.TIMEOUT_ERROR)), ms);
  });
}

/**
 * Races a promise against a timeout
 * @param promise The promise to race
 * @param ms Timeout in milliseconds
 * @param message Optional error message
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = `Operation timed out after ${ms}ms`
): Promise<T> {
  return Promise.race([
    promise,
    timeout(ms, message)
  ]);
}

/**
 * Creates a function that will throttle calls to the specified function
 * @param fn Function to throttle
 * @param wait Throttle wait time in milliseconds
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let lastCall = 0;
  let lastPromise: Promise<ReturnType<T>> | null = null;

  return async function(...args: Parameters<T>): Promise<ReturnType<T>> {
    const now = Date.now();
    const elapsed = now - lastCall;

    if (elapsed >= wait) {
      lastCall = now;
      const result = fn(...args);
      lastPromise = Promise.resolve(result);
      return result;
    } else {
      // Return the last promise if we're still in the throttle period
      if (lastPromise) {
        return lastPromise;
      }

      // Wait for the remaining throttle time, then call the function
      await delay(wait - elapsed);
      lastCall = Date.now();
      const result = fn(...args);
      lastPromise = Promise.resolve(result);
      return result;
    }
  };
}

/**
 * This function used to provide debounce functionality with Promise support,
 * but has been removed as part of the effort to eliminate time-based mechanisms.
 *
 * @deprecated This function is deprecated and will be removed.
 * Time-based debouncing has been eliminated from the codebase.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
  options: {
    leading?: boolean;
    trailing?: boolean;
    maxWait?: number;
  } = {}
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  // Direct execution without debouncing
  return function(...args: Parameters<T>): Promise<ReturnType<T>> {
    return Promise.resolve(fn(...args) as ReturnType<T>);
  };
}

/**
 * Creates a memoized version of a function
 * @param fn Function to memoize
 * @param resolver Optional function to resolve the cache key
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  resolver?: (...args: Parameters<T>) => string
): T & { cache: Map<string, ReturnType<T>> } {
  const memoized = function(...args: Parameters<T>): ReturnType<T> {
    const key = resolver ? resolver(...args) : String(args[0]);
    const cache = memoized.cache;

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  } as T & { cache: Map<string, ReturnType<T>> };

  memoized.cache = new Map();
  return memoized;
}

/**
 * Limits the number of concurrent executions of a function
 * @param fn Function to limit
 * @param limit Maximum number of concurrent executions
 */
export function limitConcurrency<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  const queue: (() => void)[] = [];
  let activeCount = 0;

  const runNext = () => {
    if (activeCount < limit && queue.length > 0) {
      const task = queue.shift()!;
      task();
    }
  };

  return async function(...args: Parameters<T>): Promise<ReturnType<T>> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        activeCount++;
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          activeCount--;
          runNext();
        }
      };

      if (activeCount < limit) {
        task();
      } else {
        queue.push(task);
      }
    });
  };
}

/**
 * Batches multiple function calls into a single execution
 * @param fn Function to batch
 * @param wait Time to wait before executing the batch
 */
export function batch<T, R>(
  fn: (items: T[]) => Promise<R[]>,
  wait: number
): (item: T) => Promise<R> {
  let batch: T[] = [];
  let pendingPromises: { resolve: (value: R) => void; reject: (reason: any) => void }[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const processBatch = async () => {
    const currentBatch = [...batch];
    const currentPromises = [...pendingPromises];

    // Reset for next batch
    batch = [];
    pendingPromises = [];
    timeoutId = null;

    try {
      const results = await fn(currentBatch);

      // Resolve each promise with its corresponding result
      results.forEach((result, index) => {
        if (index < currentPromises.length) {
          currentPromises[index].resolve(result);
        }
      });
    } catch (error) {
      // Reject all promises if the batch operation fails
      currentPromises.forEach(({ reject }) => reject(error));
    }
  };

  return (item: T): Promise<R> => {
    return new Promise((resolve, reject) => {
      batch.push(item);
      pendingPromises.push({ resolve, reject });

      if (!timeoutId) {
        timeoutId = setTimeout(processBatch, wait);
      }
    });
  };
}