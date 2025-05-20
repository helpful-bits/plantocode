"use client";

import { useState, useCallback } from "react";

// Define a generic type for the result of an async operation
export type AsyncResult<T> = {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
};

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
  execute: (...args: Args) => Promise<T | null>;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setData(null);
  }, []);

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await asyncFn(...args);
        setData(result);
        return result;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        console.error("Error in useAsyncState:", errorObj);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFn]
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
  execute: (...args: Args) => Promise<boolean>;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  const execute = useCallback(
    async (...args: Args): Promise<boolean> => {
      setIsLoading(true);
      setError(null);

      try {
        await asyncFn(...args);
        return true;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        console.error("Error in useAsyncAction:", errorObj);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFn]
  );

  return { execute, isLoading, error, reset };
}
