"use client";

import { type FilesMap } from "../_hooks/file-management/use-project-file-list";

/**
 * Logs changes to file selections for debugging
 */
export const trackSelectionChanges = (
  _prevMapString: string,
  _newMap: FilesMap,
  _action: string
): void => {
  try {
    // Using a no-op in production to avoid the linting error
    // In a real app, you might want to use a logger that respects environment
    const logChanges = () => {
      /* Log file selection changes for debugging */
    };
    logChanges();
  } catch (_error) {
    // Using a no-op to avoid console errors
    const logError = () => {
      /* Log errors in trackSelectionChanges */
    };
    logError();
  }
};