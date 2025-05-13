/**
 * Utilities Index
 *
 * This file provides a central export point for all utility functions
 * used throughout the application. Instead of importing individual utilities
 * directly, modules should import them from this index file.
 *
 * This approach has several advantages:
 * - Provides a single point of entry for all utilities
 * - Makes it easier to refactor utility functions without breaking imports
 * - Prevents circular dependencies
 * - Improves code organization
 */

// Import core utilities for direct exports below
import * as errorHandling from './error-handling';
import * as apiHelpers from './api-helpers';
import * as dateUtils from './date-utils';
import * as stringUtils from './string-utils';
import * as objectUtils from './object-utils';
import * as arrayUtils from './array-utils';
import * as validationUtils from './validation-utils';
import * as fileAccessUtils from './file-access-utils';

// Re-export everything from utility modules
export * from './error-handling';
export * from './api-helpers';
export * from './date-utils';
export * from './string-utils';
export * from './object-utils';
export * from './array-utils';
export * from './validation-utils';
export * from './file-access-utils';

// Export async utilities directly from source
export {
  delay,
  timeout,
  withTimeout,
  limitConcurrency,
  batch,
  memoize,
  throttle
} from './async-utils';

// Export function utilities directly from source
export {
  compose,
  pipe,
  rearg,
  once,
  tryCatch,
  negate,
  ary,
  partial,
  curry
} from './function-utils';

// Debounce functionality has been removed from the application
export { humanFileSize } from './file-size';

// The remaining utilities are defined below or in the imported modules

/**
 * Check if a value is defined and not null
 */
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array, or empty object)
 */
export function isEmptyValue(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Safe parse JSON with error handling
 */
export function safeParseJSON<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (e) {
    console.error("Failed to parse JSON:", e);
    return fallback;
  }
}

/**
 * Returns a noop function that can be used as a fallback
 */
export function noop(): void {
  // No operation
}

/**
 * Creates a deferred promise that can be resolved or rejected outside of the Promise constructor
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  
  return { promise, resolve, reject };
}

/**
 * Checks if running in a development environment
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Checks if running in a production environment
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Checks if running in a test environment
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Checks if code is running on server (versus browser)
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * Checks if code is running in browser (versus server)
 */
export function isBrowser(): boolean {
  return !isServer();
}