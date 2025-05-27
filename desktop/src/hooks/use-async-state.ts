"use client";

import { useState, useCallback } from "react";

// Define a generic type for the result of an async operation
export type AsyncResult<T> = {
  data?: T;
  isLoading: boolean;
  error?: Error;
  reset: () => void;
};

// Args extends unknown[] allows this hook to wrap functions with any number and type of arguments.
type AsyncFunction<T, Args extends unknown[]> = (...args: Args) => Promise<T>;

/**
 * A custom hook to manage state for asynchronous operations.
 *
 * @param asyncFn The async function to wrap
 * @returns An object with execute function, isLoading, error, and data state
 */
export function useAsyncState<T, Args extends unknown[]>(
  asyncFn: AsyncFunction<T, Args>
): AsyncResult<T> & {
  execute: (...args: Args) => Promise<T>;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [data, setData] = useState<T | undefined>(undefined);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(undefined);
    setData(undefined);
  }, []);

  const execute = useCallback(
    async (...args: Args): Promise<T> => {
      setIsLoading(true);
      setError(undefined);
      // Not calling setData(null) here to keep stale data during loading

      try {
        const result = await asyncFn(...args);
        setData(result);
        return result;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        console.error("Error in useAsyncState:", errorObj);
        throw errorObj;
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFn] // asyncFn is the primary dependency for re-memoization.
  );

  return { execute, isLoading, error, data, reset };
}

/**
 * A simplified version of useAsyncState that only tracks loading and error states
 * without storing the result data.
 *
 * @param asyncFn The async function to wrap
 * @returns An object with execute function, isLoading, and error state
 */
export function useAsyncAction<Args extends unknown[]>(
  asyncFn: AsyncFunction<unknown, Args>
): {
  execute: (...args: Args) => Promise<void>;
  isLoading: boolean;
  error?: Error;
  reset: () => void;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(undefined);
  }, []);

  const execute = useCallback(
    async (...args: Args): Promise<void> => {
      setIsLoading(true);
      setError(undefined);

      try {
        await asyncFn(...args);
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        console.error("Error in useAsyncAction:", errorObj);
        throw errorObj;
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFn]
  );

  return { execute, isLoading, error, reset };
}
