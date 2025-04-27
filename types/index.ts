export * from "./action-types"; // Keep action-types export
export * from "./session-types";
export type FileInfo = { path: string; size: number; included: boolean; forceExcluded: boolean }; // Keep FileInfo type

/**
 * Standard response shape for server actions
 */
export interface ActionState<T> {
  isSuccess: boolean;
  message: string;
  data?: T;
  error?: Error; // Add error property to fix linter errors
}
