import { type FilesMap } from "../use-project-file-list";

import type { FileInfo } from "@/types"; // Ensure correct import

export function calculateManagedFilesMap(
  rawFilesMap: FilesMap,
  currentIncludedFiles: string[],
  currentExcludedFiles: string[]
): FilesMap {
  const newManagedFilesMap: FilesMap = {};

  // Create sets for efficient lookup
  const includedComparableSet = new Set(currentIncludedFiles);
  const excludedComparableSet = new Set(currentExcludedFiles);

  // Single pass: Copy all files from rawFilesMap and apply selections
  for (const [path, fileInfo] of Object.entries(rawFilesMap)) {
    const file = fileInfo as FileInfo;
    const compPath = file.comparablePath;
    
    // Ensure exclusion takes precedence over inclusion
    if (excludedComparableSet.has(compPath)) {
      newManagedFilesMap[path] = {
        ...file,
        included: false,
        forceExcluded: true,
      };
    } else if (includedComparableSet.has(compPath)) {
      newManagedFilesMap[path] = {
        ...file,
        included: true,
        forceExcluded: false,
      };
    } else {
      newManagedFilesMap[path] = {
        ...file,
        included: false,
        forceExcluded: false,
      };
    }
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
