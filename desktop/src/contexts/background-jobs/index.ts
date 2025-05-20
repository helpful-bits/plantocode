"use client";

// Export the Provider and Context
export {
  BackgroundJobsProvider,
  BackgroundJobsContext,
  type BackgroundJobsContextType,
} from "./Provider";

// Export utility functions for direct usage
export * from "./_utils";

// Export specific hook for direct access
// Import moved to break dependency cycle 
// Must be imported directly from its module instead
// export { useBackgroundJob } from "../_hooks/use-background-job";

// Export hooks for direct usage when needed
export * from "./_hooks";
export * from "./useBackgroundJobs";
