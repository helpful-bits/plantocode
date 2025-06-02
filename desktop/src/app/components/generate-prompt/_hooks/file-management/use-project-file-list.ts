"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import { listProjectFilesAction } from "@/actions/file-system/list-project-files.action";
import { createComparablePathKey } from "@/utils/path-utils";
import { invalidateFileCache } from "@/utils/git-utils";
import { areFileMapsEqual } from "./_utils/managed-files-map-utils";

// Types
export type FileInfo = {
  path: string; // Project-relative path
  size?: number;
  included: boolean;
  forceExcluded: boolean;
  comparablePath: string; // Normalized project-relative path for consistent comparison
};

export type FilesMap = { [path: string]: FileInfo };


export function useProjectFileList(
  projectDirectory?: string,
  sessionId?: string | null
) {
  // State
  const [rawFilesMap, setRawFilesMap] = useState<FilesMap>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  // Ref to prevent concurrent fetches
  const isFetchingRef = useRef(false);

  // Refresh files list method - uses direct Tauri command
  const refreshFiles = useCallback(async (force?: boolean): Promise<boolean> => {
    if (!projectDirectory) {
      return false;
    }

    if (isFetchingRef.current) {
      console.debug("[useProjectFileList] Skipping refresh, already in progress.");
      return false;
    }
    isFetchingRef.current = true;

    // If force refresh is requested, invalidate the file cache
    if (force) {
      invalidateFileCache(projectDirectory);
    }

    setIsLoading(true);
    setError(undefined);

    try {
      // Call the direct Tauri command to list files
      const result = await listProjectFilesAction({
        directory: projectDirectory,
        pattern: "**/*", // Default pattern for all files
        includeStats: true, // Include file stats to get size information
        exclude: [], // No exclude patterns by default
      });

      if (!result.isSuccess || !result.data || !Array.isArray(result.data)) {
        setError(result.message || "Failed to list project files or invalid data returned");
        setIsLoading(false);
        isFetchingRef.current = false;
        return false;
      }

      // Process file paths from the direct response
      const filesMap: FilesMap = {};

      for (const fileInfo of result.data) {
        try {
          if (!fileInfo || !fileInfo.path) continue;

          const projectRelativePath = fileInfo.path; // Already project-relative from backend

          // If projectRelativePath is empty or null, skip.
          if (!projectRelativePath) continue;

          // No automatic inclusion
          const include = false;

          // comparablePath is used for consistent lookups and comparisons.
          // It should be a consistently formatted version of fileInfo.path.
          // Apply createComparablePathKey to normalize the path format consistently
          const comparablePath = createComparablePathKey(projectRelativePath);

          // Add to file map
          filesMap[projectRelativePath] = {
            path: projectRelativePath,
            size: fileInfo.size || undefined,
            included: include,
            forceExcluded: false,
            comparablePath: comparablePath, // Use the consistently formatted relative path
          };
        } catch (_err) {
          // Skip files that can't be processed
          continue;
        }
      }

      // Update state
      setRawFilesMap(prevMap => areFileMapsEqual(prevMap, filesMap) ? prevMap : filesMap);
      setIsInitialized(true);
      setIsLoading(false);
      setError(undefined);

      return true;
    } catch (readError) {
      const errorMessage = readError instanceof Error
        ? readError.message
        : "Unknown error reading directory";
      setError(errorMessage);
      setIsLoading(false);
      return false;
    } finally {
      isFetchingRef.current = false;
    }
  }, [projectDirectory]);

  // Reset state when project directory changes
  useEffect(() => {
    // Reset state when project directory changes
    setRawFilesMap({});
    setError(undefined);
    setIsInitialized(false);
    
    // Invalidate file cache when project directory changes
    if (projectDirectory) {
      invalidateFileCache(projectDirectory);
    }
  }, [projectDirectory, sessionId]);

  return useMemo(
    () => ({
      rawFilesMap,
      isLoading,
      isInitialized,
      error,
      refreshFiles,
    }),
    [rawFilesMap, isLoading, isInitialized, error, refreshFiles]
  );
}