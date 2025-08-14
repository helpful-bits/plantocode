"use client";

// Export the Provider and Context
export {
  BackgroundJobsProvider,
  BackgroundJobsContext,
  type BackgroundJobsContextType,
} from "./Provider";

// Utility functions have been removed as part of the event-driven refactoring


// Export hooks for direct usage when needed
export * from "./_hooks";
export * from "./useBackgroundJobs";
