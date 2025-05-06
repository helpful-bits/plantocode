"use client";

import { FilesMap } from "../_hooks/file-management/use-project-file-list";
import { shouldIncludeByDefault } from './file-selection';
import { normalizePathForComparison } from '@/lib/path-utils';

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
  // Normalize all paths in the includes/excludes sets for consistent comparison
  const includedSet = new Set((includedPaths || []).map(p => normalizePathForComparison(p)));
  const excludedSet = new Set((excludedPaths || []).map(p => normalizePathForComparison(p)));
  
  // Create lookup maps for faster comparison
  const filePathCompMap = new Map<string, string>(); // Maps comparablePath to actual path
  const fileComparablePathMap = new Map<string, string>(); // Maps actual path to comparablePath
  
  // Build path maps for faster lookups
  Object.keys(result).forEach(path => {
    const fileInfo = result[path];
    const comparablePath = fileInfo.comparablePath || normalizePathForComparison(path);
    
    filePathCompMap.set(comparablePath, path);
    fileComparablePathMap.set(path, comparablePath);
  });
  
  // Log the input counts for debugging
  console.log(`[Selection Merge] Applying selections: ${includedSet.size} included, ${excludedSet.size} excluded files to ${Object.keys(result).length} total files`);
  
  // Count for validation statistics
  let defaultIncludedCount = 0;
  let defaultExcludedCount = 0;
  let explicitlyIncludedCount = 0;
  let explicitlyExcludedCount = 0;
  let missingIncludedPaths = 0;
  let missingExcludedPaths = 0;
  
  // Helper function to find file by comparable path (supporting the various matching strategies)
  const findPathInMap = (normalizedPath: string): string | null => {
    // Direct match using comparable path
    if (filePathCompMap.has(normalizedPath)) {
      return filePathCompMap.get(normalizedPath) || null;
    }
    
    // Try path ending match (handles project-relative paths)
    for (const [compPath, actualPath] of filePathCompMap.entries()) {
      if (normalizedPath && compPath.endsWith('/' + normalizedPath)) {
        return actualPath;
      }
    }
    
    // Try input path contains map path (for full absolute paths)
    for (const [compPath, actualPath] of filePathCompMap.entries()) {
      if (normalizedPath.includes(compPath)) {
        return actualPath;
      }
    }
    
    return null;
  };
  
  // First, create maps of included and excluded paths that match files in our current map
  const matchedIncludedPaths = new Map<string, string>(); // Maps actual path to normalized session path
  const matchedExcludedPaths = new Map<string, string>(); // Maps actual path to normalized session path
  
  // Find matches for included paths
  if (includedSet.size > 0) {
    for (const normalizedPath of includedSet) {
      const matchedPath = findPathInMap(normalizedPath);
      if (matchedPath) {
        matchedIncludedPaths.set(matchedPath, normalizedPath);
      } else {
        missingIncludedPaths++;
      }
    }
  }
  
  // Find matches for excluded paths
  if (excludedSet.size > 0) {
    for (const normalizedPath of excludedSet) {
      const matchedPath = findPathInMap(normalizedPath);
      if (matchedPath) {
        matchedExcludedPaths.set(matchedPath, normalizedPath);
      } else {
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
    if (matchedExcludedPaths.has(path)) {
      // Path is explicitly excluded
      result[path] = {
        ...result[path],
        included: false,
        forceExcluded: true
      };
      explicitlyExcludedCount++;
    } else if (matchedIncludedPaths.has(path)) {
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