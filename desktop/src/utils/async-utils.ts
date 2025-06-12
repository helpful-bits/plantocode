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
 * Creates a promise that resolves after the specified timeout with cleanup
 * @param ms Timeout in milliseconds
 */
export function delay(ms: number): Promise<void> & { cleanup: () => void } {
  let timeoutId: number;
  
  const promise = new Promise<void>((resolve) => {
    timeoutId = window.setTimeout(resolve, ms);
  }) as Promise<void> & { cleanup: () => void };
  
  // Add cleanup function
  promise.cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
  
  return promise;
}

/**
 * Creates a promise that rejects after the specified timeout with proper cleanup
 * @param ms Timeout in milliseconds
 * @param message Optional error message
 * @returns A promise that rejects with timeout error and cleanup function
 */
export function timeout(
  ms: number,
  message = `Operation timed out after ${ms}ms`
): Promise<never> & { cleanup: () => void } {
  let timeoutId: number;
  
  const promise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(createError(message, ErrorType.TIMEOUT_ERROR));
    }, ms);
  }) as Promise<never> & { cleanup: () => void };
  
  // Add cleanup function to the promise
  promise.cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
  
  return promise;
}

/**
 * Races a promise against a timeout with proper cleanup
 * @param promise The promise to race
 * @param ms Timeout in milliseconds
 * @param message Optional error message
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = `Operation timed out after ${ms}ms`
): Promise<T> {
  let timeoutId: number;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(createError(message, ErrorType.TIMEOUT_ERROR));
    }, ms);
  });
  
  return Promise.race([
    promise.finally(() => {
      // Clean up timeout when main promise resolves/rejects
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }),
    timeoutPromise
  ]);
}

/**
 * Creates a function that will throttle calls to the specified function with cleanup
 * @param fn Function to throttle
 * @param wait Throttle wait time in milliseconds
 */
export function throttle<A extends unknown[], R>(
  fn: (...args: A) => R,
  wait: number
): ((...args: A) => Promise<R>) & { cleanup: () => void } {
  let lastCall = 0;
  let lastPromise: Promise<R> | null = null;
  let pendingDelay: (Promise<void> & { cleanup: () => void }) | null = null;

  const throttledFunction = (async function (...args: A): Promise<R> {
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
      pendingDelay = delay(wait - elapsed);
      try {
        await pendingDelay;
        lastCall = Date.now();
        const result = fn(...args);
        lastPromise = Promise.resolve(result);
        return result;
      } finally {
        pendingDelay = null;
      }
    }
  }) as ((...args: A) => Promise<R>) & { cleanup: () => void };

  // Add cleanup function
  throttledFunction.cleanup = () => {
    if (pendingDelay) {
      pendingDelay.cleanup();
      pendingDelay = null;
    }
    lastPromise = null;
  };

  return throttledFunction;
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
 * Batches multiple function calls into a single execution with cleanup
 * @param fn Function to batch
 * @param wait Time to wait before executing the batch
 */
export function batch<T, R>(
  fn: (items: T[]) => Promise<R[]>,
  wait: number
): ((item: T) => Promise<R>) & { cleanup: () => void } {
  let batchItems: T[] = [];
  let pendingPromises: {
    resolve: (value: R) => void;
    reject: (reason: unknown) => void;
  }[] = [];
  let timeoutId: number | null = null;

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

  const batchFunction = (item: T): Promise<R> => {
    return new Promise((resolve, reject) => {
      batchItems.push(item);
      pendingPromises.push({ resolve, reject });

      if (!timeoutId) {
        timeoutId = window.setTimeout(processBatch, wait);
      }
    });
  };

  // Create typed function with cleanup method
  const typedBatchFunction = batchFunction as typeof batchFunction & { cleanup: () => void };

  // Add cleanup function
  typedBatchFunction.cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    // Reject all pending promises with cancellation error
    pendingPromises.forEach(({ reject }) => {
      reject(createError('Batch operation was cancelled', ErrorType.UNKNOWN_ERROR));
    });
    batchItems = [];
    pendingPromises = [];
  };

  return typedBatchFunction;
}
