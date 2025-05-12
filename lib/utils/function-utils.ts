/**
 * Utility functions for functional programming patterns
 *
 * This module provides pure functional programming utilities.
 * For async-related functions (memoize, throttle), import from async-utils.
 */

/**
 * Creates a function that is the composition of the provided functions
 * @param funcs The functions to compose
 */
export function compose<T>(...funcs: Array<(arg: T) => T>): (arg: T) => T {
  if (funcs.length === 0) {
    return (arg: T) => arg;
  }

  if (funcs.length === 1) {
    return funcs[0];
  }

  return funcs.reduce(
    (a, b) => (arg: T) => a(b(arg))
  );
}

/**
 * Creates a function that is the composition of the provided functions, where each function consumes the return value of the function that follows
 * @param funcs The functions to pipe
 */
export function pipe<T>(...funcs: Array<(arg: T) => T>): (arg: T) => T {
  if (funcs.length === 0) {
    return (arg: T) => arg;
  }

  if (funcs.length === 1) {
    return funcs[0];
  }

  return funcs.reduce(
    (a, b) => (arg: T) => b(a(arg))
  );
}

/**
 * Creates a function that invokes func with arguments arranged according to the specified indexes
 * @param func The function to reorder parameters for
 * @param indexes The arranged indexes for params
 */
export function rearg<T extends (...args: any[]) => any>(
  func: T,
  indexes: number[]
): (...args: any[]) => ReturnType<T> {
  return function(...args: any[]): ReturnType<T> {
    const reordered = indexes.map(i => args[i]);
    return func(...reordered);
  };
}

/**
 * Creates a function that only invokes func once
 * @param func The function to restrict
 */
export function once<T extends (...args: any[]) => any>(
  func: T
): (...args: Parameters<T>) => ReturnType<T> {
  let called = false;
  let result: ReturnType<T>;

  return function(...args: Parameters<T>): ReturnType<T> {
    if (!called) {
      called = true;
      result = func(...args);
    }
    return result;
  };
}

/**
 * Wraps a function to catch any errors and return a default value instead
 * @param func The function to wrap
 * @param defaultValue The default value to return if func throws
 */
export function tryCatch<T extends (...args: any[]) => any>(
  func: T,
  defaultValue: ReturnType<T>
): (...args: Parameters<T>) => ReturnType<T> {
  return function(...args: Parameters<T>): ReturnType<T> {
    try {
      return func(...args);
    } catch (error) {
      return defaultValue;
    }
  };
}

/**
 * Creates a function that negates the result of the predicate
 * @param predicate The predicate to negate
 */
export function negate<T>(
  predicate: (arg: T) => boolean
): (arg: T) => boolean {
  return function(arg: T): boolean {
    return !predicate(arg);
  };
}

/**
 * Creates a function that accepts up to n arguments, ignoring any additional arguments
 * @param func The function to cap arguments for
 * @param n The arity cap
 */
export function ary<T extends (...args: any[]) => any>(
  func: T,
  n: number
): (...args: any[]) => ReturnType<T> {
  return function(...args: any[]): ReturnType<T> {
    return func(...args.slice(0, n));
  };
}

/**
 * Partially apply a function by filling in any number of its arguments
 * @param func The function to partially apply
 * @param args The arguments to be partially applied
 */
export function partial<T extends (...args: any[]) => any>(
  func: T,
  ...partials: any[]
): (...args: any[]) => ReturnType<T> {
  return function(...args: any[]): ReturnType<T> {
    return func(...partials, ...args);
  };
}

/**
 * Creates a function that invokes func with partials prepended to the arguments it receives
 * @param func The function to curry
 * @param arity The arity of func
 */
export function curry<T extends (...args: any[]) => any>(
  func: T,
  arity = func.length
): any {
  function curried(...args: any[]): any {
    if (args.length >= arity) {
      return func(...args);
    }

    return function(...moreArgs: any[]): any {
      return curried(...args, ...moreArgs);
    };
  }

  return curried;
}