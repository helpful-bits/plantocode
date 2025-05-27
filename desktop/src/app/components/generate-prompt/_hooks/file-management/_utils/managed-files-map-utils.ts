import { type FilesMap } from "../use-project-file-list";

import type { FileInfo } from "@/types"; // Ensure correct import

export function calculateManagedFilesMap(
  rawFilesMap: FilesMap,
  currentIncludedFiles: string[],
  currentExcludedFiles: string[]
): FilesMap {
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
    
    newManagedFilesMap[path] = {
      ...file,
      included: isIncluded,
      forceExcluded: isExcluded,
    };
  }

  return newManagedFilesMap;
}

export function areFileMapsEqual(map1: FilesMap, map2: FilesMap): boolean {
  const keys1 = Object.keys(map1);
  const keys2 = Object.keys(map2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!map2[key]) return false;

    const file1 = map1[key] as FileInfo;
    const file2 = map2[key] as FileInfo;

    if (
      file1.included !== file2.included ||
      file1.forceExcluded !== file2.forceExcluded
    ) {
      return false;
    }
  }
  return true;
}
