"use client";

import { FilesMap } from "../_hooks/use-generate-prompt-state";

/**
 * Merges the selection state (included/forceExcluded flags) from an old files map to a new one
 * for every common path. This preserves user selections when refreshing the file list.
 * 
 * @param oldMap The previous FilesMap containing user selections
 * @param newMap The fresh FilesMap with updated file data
 * @returns A copy of newMap with selection flags copied from oldMap where paths match
 */
export function mergeFileMaps(oldMap: FilesMap | undefined, newMap: FilesMap): FilesMap {
  if (!oldMap) return newMap;
  
  const result = { ...newMap };
  
  // For each file in the new map, copy selection state from old map if it exists
  Object.keys(result).forEach(path => {
    if (oldMap[path]) {
      result[path] = {
        ...result[path],
        included: oldMap[path].included,
        forceExcluded: oldMap[path].forceExcluded
      };
    }
  });
  
  return result;
}

/**
 * Applies saved selection state from a session to a files map.
 * Sets included/forceExcluded flags based on the arrays of paths.
 * 
 * @param filesMap The FilesMap to update
 * @param includedPaths Array of paths that should be marked as included
 * @param excludedPaths Array of paths that should be marked as forceExcluded
 * @returns The updated FilesMap with selection state applied
 */
export function applySessionSelections(
  filesMap: FilesMap,
  includedPaths?: string[], 
  excludedPaths?: string[]
): FilesMap {
  if (!includedPaths && !excludedPaths) return filesMap;
  
  const result = { ...filesMap };
  const includedSet = new Set(includedPaths || []);
  const excludedSet = new Set(excludedPaths || []);
  
  // Reset all selections first (necessary to handle files that were previously 
  // selected but should now be defaulted)
  Object.keys(result).forEach(path => {
    // Default state: not included, not force-excluded
    result[path] = {
      ...result[path],
      included: false,
      forceExcluded: false
    };
  });
  
  // Apply included paths
  if (includedPaths) {
    includedPaths.forEach(path => {
      if (result[path]) {
        result[path].included = true;
        result[path].forceExcluded = false; // Ensure they're not also excluded
      }
    });
  }
  
  // Apply excluded paths
  if (excludedPaths) {
    excludedPaths.forEach(path => {
      if (result[path]) {
        result[path].forceExcluded = true;
        result[path].included = false; // Ensure they're not also included
      }
    });
  }
  
  return result;
} 