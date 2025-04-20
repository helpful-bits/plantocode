"use client";

import { FilesMap } from "../_hooks/use-generate-prompt-state";

/**
 * Identifies and logs changes between two files maps.
 * Used to track what files have changed in selection state for debugging.
 */
export const trackSelectionChanges = (
  oldMap: FilesMap,
  newMap: FilesMap
): { path: string; change: string }[] => {
  const changes: { path: string; change: string }[] = [];

  // Check files that exist in both maps or in the old map
  Object.keys(oldMap).forEach((path) => {
    // Check if removed
    if (!newMap[path]) {
      changes.push({ path, change: "removed" });
      return;
    }

    // Check if inclusion state changed
    if (oldMap[path].included !== newMap[path].included) {
      changes.push({
        path,
        change: newMap[path].included ? "selected" : "unselected",
      });
    }

    // Check if exclusion state changed
    if (oldMap[path].forceExcluded !== newMap[path].forceExcluded) {
      changes.push({
        path,
        change: newMap[path].forceExcluded ? "excluded" : "un-excluded",
      });
    }
  });

  // Check for files that only exist in the new map
  Object.keys(newMap).forEach((path) => {
    if (!oldMap[path]) {
      changes.push({ path, change: "added" });
    }
  });

  return changes;
}; 