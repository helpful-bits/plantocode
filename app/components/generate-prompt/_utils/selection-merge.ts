"use client";

import { FilesMap } from "../_hooks/use-file-selection-state";
import { shouldIncludeByDefault } from './file-selection';

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
  
  // Clone to avoid mutation
  const result = { ...newMap };
  
  // Count statistics for debugging
  let preservedCount = 0;
  let newFilesCount = 0;
  let missingFilesCount = 0;
  
  // For each file in the new map, copy selection state from old map if it exists
  Object.keys(result).forEach(path => {
    if (oldMap[path]) {
      result[path] = {
        ...result[path],
        included: oldMap[path].included,
        forceExcluded: oldMap[path].forceExcluded
      };
      preservedCount++;
    } else {
      // This is a new file
      newFilesCount++;
    }
  });
  
  // Track files that were in oldMap but not in newMap
  Object.keys(oldMap).forEach(path => {
    if (!result[path]) {
      missingFilesCount++;
    }
  });
  
  // Log statistics for debugging
  console.log(`[Selection Merge] Stats: ${preservedCount} selections preserved, ${newFilesCount} new files, ${missingFilesCount} files removed`);
  
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
  if (!filesMap || Object.keys(filesMap).length === 0) {
    console.warn('[Selection Merge] Cannot apply selections to empty filesMap');
    return filesMap;
  }
  
  const result = { ...filesMap };
  const includedSet = new Set(includedPaths || []);
  const excludedSet = new Set(excludedPaths || []);
  
  // Log the input counts for debugging
  console.log(`[Selection Merge] Applying selections: ${includedSet.size} included, ${excludedSet.size} excluded files to ${Object.keys(result).length} total files`);
  
  // Count for validation statistics
  let defaultIncludedCount = 0;
  let defaultExcludedCount = 0;
  let explicitlyIncludedCount = 0;
  let explicitlyExcludedCount = 0;
  let missingIncludedPaths = 0;
  let missingExcludedPaths = 0;
  
  // First, check which paths exist in the filesMap
  if (includedSet.size > 0) {
    for (const path of includedSet) {
      if (!result[path]) {
        missingIncludedPaths++;
      }
    }
  }
  
  if (excludedSet.size > 0) {
    for (const path of excludedSet) {
      if (!result[path]) {
        missingExcludedPaths++;
      }
    }
  }
  
  // Log warning if paths are missing
  if (missingIncludedPaths > 0 || missingExcludedPaths > 0) {
    console.warn(`[Selection Merge] Warning: ${missingIncludedPaths} included paths and ${missingExcludedPaths} excluded paths are not present in the file map`);
  }
  
  // Process each path in the input filesMap
  Object.keys(result).forEach(path => {
    if (excludedSet.has(path)) {
      // Path is explicitly excluded
      result[path] = {
        ...result[path],
        included: false,
        forceExcluded: true
      };
      explicitlyExcludedCount++;
    } else if (includedSet.has(path)) {
      // Path is explicitly included
      result[path] = {
        ...result[path],
        included: true,
        forceExcluded: false
      };
      explicitlyIncludedCount++;
    } else {
      // Path not explicitly mentioned in session lists
      // Determine default inclusion using shouldIncludeByDefault
      const shouldInclude = shouldIncludeByDefault(path);
      result[path] = {
        ...result[path],
        included: shouldInclude,
        forceExcluded: false
      };
      
      if (shouldInclude) {
        defaultIncludedCount++;
      } else {
        defaultExcludedCount++;
      }
    }
  });
  
  // Log detailed information about how files were categorized
  console.log(`[Selection Merge] Applied selections:
    - ${explicitlyIncludedCount} explicitly included files (${missingIncludedPaths} missing from file map)
    - ${explicitlyExcludedCount} explicitly excluded files (${missingExcludedPaths} missing from file map)
    - ${defaultIncludedCount} files included by default
    - ${defaultExcludedCount} files excluded by default
    - ${Object.keys(result).length} total files
  `);
  
  return result;
} 