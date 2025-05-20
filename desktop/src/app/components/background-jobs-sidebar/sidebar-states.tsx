import React from "react";

/**
 * Empty state component shown when there are no jobs to display
 */
export const EmptyState = React.memo(() => (
  <div className="px-4 py-8 text-center min-h-[calc(100vh-10rem)] flex items-center justify-center w-full">
    <p className="text-xs text-muted-foreground text-balance">
      No active tasks
    </p>
  </div>
));

/**
 * Loading state component shown while jobs are being fetched
 */
export const LoadingState = React.memo(() => (
  <div className="flex justify-center items-center py-8 min-h-[calc(100vh-10rem)] w-full">
    <div className="text-xs text-muted-foreground">Loading tasks</div>
  </div>
));

// Add displayNames for better debugging
EmptyState.displayName = "EmptyState";
LoadingState.displayName = "LoadingState";
