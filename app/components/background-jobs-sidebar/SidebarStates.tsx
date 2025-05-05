import React from 'react';

/**
 * Empty state component shown when there are no jobs to display
 */
export const EmptyState = React.memo(() => (
  <div className="px-3 py-6 text-center min-h-[100px] flex items-center justify-center">
    <p className="text-xs text-muted-foreground">No active tasks</p>
  </div>
));

/**
 * Loading state component shown while jobs are being fetched
 */
export const LoadingState = React.memo(() => (
  <div className="flex justify-center items-center py-6 min-h-[100px]">
    <div className="text-xs text-muted-foreground">Loading tasks</div>
  </div>
));

// Add displayNames for better debugging
EmptyState.displayName = 'EmptyState';
LoadingState.displayName = 'LoadingState';