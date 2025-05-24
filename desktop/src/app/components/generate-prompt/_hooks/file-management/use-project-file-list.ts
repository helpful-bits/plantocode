"use client";

import { useState, useCallback, useEffect } from "react";

import { listProjectFilesAction } from "@/actions/file-system/list-project-files.action";
import { useNotification } from "@/contexts/notification-context";
import {
  normalizePath,
  normalizePathForComparison,
} from "@/utils/path-utils";

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
  projectDirectory: string | null,
  sessionId: string | null
) {
  // State
  const [rawFilesMap, setRawFilesMap] = useState<FilesMap>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const { showNotification: _showNotification } = useNotification();

  // Refresh files list method - uses direct Tauri command
  const refreshFiles = useCallback(async (): Promise<boolean> => {
    if (!projectDirectory) {
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Call the direct Tauri command to list files
      const result = await listProjectFilesAction({
        directory: projectDirectory,
        pattern: "**/*", // Default pattern for all files
        include_stats: false, // Don't need file stats for this use case
        exclude: [], // No exclude patterns by default
      });

      if (!result.isSuccess) {
        setError(result.message || "Failed to list project files");
        setIsLoading(false);
        return false;
      }

      if (!result.data) {
        setError("No data returned from file listing");
        setIsLoading(false);
        return false;
      }

      // Process file paths from the direct response
      const filesMap: FilesMap = {};

      for (const projectRelativePath of result.data.files) {
        try {
          if (!projectRelativePath) continue;

          // Normalize the project-relative path.
          // The normalizePath command can handle relative paths and clean them up (e.g. slashes, dots).
          const normalizedProjectRelativePath = await normalizePath(projectRelativePath);

          // If normalizedProjectRelativePath is empty or null after normalization, skip.
          if (!normalizedProjectRelativePath) continue;

          // No automatic inclusion
          const include = false;

          // The comparablePath should be derived from the already relative path.
          const comparablePath = await normalizePathForComparison(normalizedProjectRelativePath);

          // Add to file map
          filesMap[normalizedProjectRelativePath] = {
            path: normalizedProjectRelativePath,
            size: undefined, // Size not requested
            included: include,
            forceExcluded: false,
            comparablePath,
          };
        } catch (_err) {
          // Skip files that can't be processed
          continue;
        }
      }

      // Update state
      setRawFilesMap(filesMap);
      setIsInitialized(true);
      setIsLoading(false);
      setError(null);

      return true;
    } catch (readError) {
      const errorMessage = readError instanceof Error
        ? readError.message
        : "Unknown error reading directory";
      setError(errorMessage);
      setIsLoading(false);
      return false;
    }
  }, [projectDirectory]);

  // Reset state when project directory changes
  useEffect(() => {
    // Reset state when project directory changes
    setRawFilesMap({});
    setError(null);
    setIsInitialized(false);
  }, [projectDirectory, sessionId]);

  return {
    rawFilesMap,
    isLoading,
    isInitialized,
    error,
    refreshFiles,
  };
}