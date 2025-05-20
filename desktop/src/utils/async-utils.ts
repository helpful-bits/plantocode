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
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

/**
 * Creates a promise that resolves after the specified timeout
 * @param ms Timeout in milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a promise that rejects after the specified timeout
 * @param ms Timeout in milliseconds
 * @param message Optional error message
 */
export function timeout(
  ms: number,
  message = `Operation timed out after ${ms}ms`
): Promise<never> {
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
  return Promise.race([promise, timeout(ms, message)]);
}

/**
 * Creates a function that will throttle calls to the specified function
 * @param fn Function to throttle
 * @param wait Throttle wait time in milliseconds
 */
export function throttle<A extends unknown[], R>(
  fn: (...args: A) => R,
  wait: number
): (...args: A) => Promise<R> {
  let lastCall = 0;
  let lastPromise: Promise<R> | null = null;

  return async function (...args: A): Promise<R> {
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
export function debounce<A extends unknown[], R>(
  fn: (...args: A) => R,
  _wait: number, // Keeping parameter for compatibility, but not using it
  _options: {
    leading?: boolean;
    trailing?: boolean;
    maxWait?: number;
  } = {}
): (...args: A) => Promise<R> {
  // Direct execution without debouncing
  return function (...args: A): Promise<R> {
    return Promise.resolve(fn(...args));
  };
}

/**
 * Creates a memoized version of a function
 * @param fn Function to memoize
 * @param resolver Optional function to resolve the cache key
 */
export function memoize<A extends unknown[], R>(
  fn: (...args: A) => R,
  resolver?: (...args: A) => string
): ((...args: A) => R) & { cache: Map<string, R> } {
  const memoized = function (...args: A): R {
    const key = resolver ? resolver(...args) : String(args[0]);
    const cache = memoized.cache;

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  } as ((...args: A) => R) & { cache: Map<string, R> };

  memoized.cache = new Map();
  return memoized;
}

/**
 * Limits the number of concurrent executions of a function
 * @param fn Function to limit
 * @param limit Maximum number of concurrent executions
 */
export function limitConcurrency<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  limit: number
): (...args: A) => Promise<R> {
  const queue: (() => void)[] = [];
  let activeCount = 0;

  const runNext = () => {
    if (activeCount < limit && queue.length > 0) {
      const task = queue.shift()!;
      task();
    }
  };

  return async function (...args: A): Promise<R> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        activeCount++;
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(new Error(String(error)));
        } finally {
          activeCount--;
          runNext();
        }
      };

      if (activeCount < limit) {
        void task();
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
  let batchItems: T[] = [];
  let pendingPromises: {
    resolve: (value: R) => void;
    reject: (reason: unknown) => void;
  }[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const processBatch = async () => {
    const currentBatch = [...batchItems];
    const currentPromises = [...pendingPromises];

    // Reset for next batch
    batchItems = [];
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
      batchItems.push(item);
      pendingPromises.push({ resolve, reject });

      if (!timeoutId) {
        timeoutId = setTimeout(processBatch, wait);
      }
    });
  };
}
