import { useRef } from "react";

/**
 * Creates a stable reference for a value that won't change identity between renders
 * but will always contain the latest values.
 *
 * This solves the core problem of passing dependencies to hooks without causing re-renders.
 *
 * @param value The value to create a stable reference for
 * @returns A stable reference object that won't change identity but contains the latest value
 */
export function useStableRef<T>(value: T): { readonly current: T } {
  const ref = useRef(value);

  // Update the ref value without triggering re-renders
  ref.current = value;

  // Return a readonly reference to prevent accidental mutations
  return ref;
}
