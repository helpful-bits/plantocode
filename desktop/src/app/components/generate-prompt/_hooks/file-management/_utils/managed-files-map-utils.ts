import { normalizePathForComparison } from "@/utils/path-utils";

import { type FilesMap } from "../use-project-file-list";

import type { FileInfo } from "@/types"; // Ensure correct import

export function calculateManagedFilesMap(
  rawFilesMap: FilesMap,
  currentIncludedFiles: string[],
  currentExcludedFiles: string[]
): FilesMap {
  const newManagedFilesMap: FilesMap = {};

  // First pass: Copy all files from rawFilesMap
  for (const [path, fileInfo] of Object.entries(rawFilesMap)) {
    newManagedFilesMap[path] = {
      ...(fileInfo as FileInfo), // Cast to FileInfo
      included: false,
      forceExcluded: false,
    };
  }

  // Second pass: Apply session selections
  if (currentIncludedFiles.length > 0) {
    for (const includedPath of currentIncludedFiles) {
      const normalizedIncludedPath = normalizePathForComparison(includedPath);
      for (const [path, fileInfo] of Object.entries(newManagedFilesMap)) {
        const comparablePath =
          (fileInfo as FileInfo).comparablePath ||
          normalizePathForComparison(path);
        if (comparablePath === normalizedIncludedPath) {
          newManagedFilesMap[path] = {
            ...(fileInfo as FileInfo),
            included: true,
            forceExcluded: false,
          };
          break;
        }
      }
    }
  }

  if (currentExcludedFiles.length > 0) {
    for (const excludedPath of currentExcludedFiles) {
      const normalizedExcludedPath = normalizePathForComparison(excludedPath);
      for (const [path, fileInfo] of Object.entries(newManagedFilesMap)) {
        const comparablePath =
          (fileInfo as FileInfo).comparablePath ||
          normalizePathForComparison(path);
        if (comparablePath === normalizedExcludedPath) {
          newManagedFilesMap[path] = {
            ...(fileInfo as FileInfo),
            included: false,
            forceExcluded: true,
          };
          break;
        }
      }
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
