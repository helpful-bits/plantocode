import { type FilesMap } from "../use-project-file-list";

import type { FileInfo } from "@/types"; // Ensure correct import

// Cache for previously calculated maps to avoid unnecessary recalculations
const mapCache = new Map<string, FilesMap>();
const MAX_CACHE_SIZE = 50;

// Generate cache key for memoization
function generateCacheKey(
  rawFilesMapSize: number,
  includedFiles: string[],
  excludedFiles: string[]
): string {
  // Use simple concatenation for cache key - much faster than JSON.stringify
  return `${rawFilesMapSize}:${includedFiles.length}:${excludedFiles.length}:${includedFiles.join(',')}:${excludedFiles.join(',')}`;
}

export function calculateManagedFilesMap(
  rawFilesMap: FilesMap,
  currentIncludedFiles: string[],
  currentExcludedFiles: string[]
): FilesMap {
  // Generate cache key for memoization
  const cacheKey = generateCacheKey(
    Object.keys(rawFilesMap).length,
    currentIncludedFiles,
    currentExcludedFiles
  );
  
  // Check cache first
  const cached = mapCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const newManagedFilesMap: FilesMap = {};

  // Create sets for efficient lookup - only if arrays are not empty to avoid unnecessary set creation
  const includedComparableSet = currentIncludedFiles.length > 0 ? new Set(currentIncludedFiles) : null;
  const excludedComparableSet = currentExcludedFiles.length > 0 ? new Set(currentExcludedFiles) : null;

  // Single pass: Copy all files from rawFilesMap and apply selections
  for (const [path, fileInfo] of Object.entries(rawFilesMap)) {
    const file = fileInfo as FileInfo;
    const compPath = file.comparablePath;
    
    // Ensure exclusion takes precedence over inclusion
    const isExcluded = excludedComparableSet?.has(compPath) ?? false;
    const isIncluded = !isExcluded && (includedComparableSet?.has(compPath) ?? false);
    
    // Only create new object if selection state actually changed
    if (file.included === isIncluded && file.forceExcluded === isExcluded) {
      newManagedFilesMap[path] = file;
    } else {
      newManagedFilesMap[path] = {
        ...file,
        included: isIncluded,
        forceExcluded: isExcluded,
      };
    }
  }

  // Cache the result with LRU eviction
  if (mapCache.size >= MAX_CACHE_SIZE) {
    const firstKey = mapCache.keys().next().value;
    if (firstKey !== undefined) {
      mapCache.delete(firstKey);
    }
  }
  mapCache.set(cacheKey, newManagedFilesMap);

  return newManagedFilesMap;
}

export function areFileMapsEqual(map1: FilesMap, map2: FilesMap): boolean {
  // Fast reference equality check first
  if (map1 === map2) return true;
  
  const keys1 = Object.keys(map1);
  const keys2 = Object.keys(map2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    const file1 = map1[key] as FileInfo;
    const file2 = map2[key] as FileInfo;
    
    if (!file2) return false;
    
    // Fast reference equality check for files
    if (file1 === file2) continue;

    if (
      file1.included !== file2.included ||
      file1.forceExcluded !== file2.forceExcluded
    ) {
      return false;
    }
  }
  return true;
}

// Utility to clear cache when needed (e.g., on project change)
export function clearManagedFilesMapCache(): void {
  mapCache.clear();
}
