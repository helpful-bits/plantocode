"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";

import { normalizePathForComparison } from "@/utils/path-utils";

import {
  calculateManagedFilesMap,
  areFileMapsEqual,
} from "./_utils/managed-files-map-utils";
import { type FilesMap } from "./use-project-file-list";

import type { FileInfo } from "@/types";

// Define the missing FileSelection interface
interface FileSelection extends FileInfo {
  included: boolean;
  forceExcluded: boolean;
}

interface UseFileSelectionCoreProps {
  rawFilesMap: FilesMap;
  currentIncludedFiles: string[];
  currentExcludedFiles: string[];
  onUpdateIncludedFiles: (paths: string[]) => void;
  onUpdateExcludedFiles: (paths: string[]) => void;
}

/**
 * Core hook for managing file selection state
 * Handles toggle operations and bulk selections
 */
export function useFileSelectionCore({
  rawFilesMap,
  currentIncludedFiles,
  currentExcludedFiles,
  onUpdateIncludedFiles,
  onUpdateExcludedFiles,
}: UseFileSelectionCoreProps) {
  const [managedFilesMap, setManagedFilesMap] = useState<FilesMap>({});

  // Track consecutive individual toggles for improved batching
  const toggleCountRef = useRef(0);
  const lastToggleTimeRef = useRef(0);

  // Track pending bulk operations
  const bulkOperationCountRef = useRef(0);
  const lastBulkOperationTimeRef = useRef(0);

  // Session deletion detection refs
  const isSessionDeletionRef = useRef<boolean>(false);
  const prevIncludedFilesLengthRef = useRef<number>(0);
  const prevExcludedFilesLengthRef = useRef<number>(0);

  // File selection handlers
  const toggleFileSelection = useCallback(
    async (path: string) => {
      // Track rapid consecutive toggles to detect potential click storms
      const now = Date.now();
      const timeSinceLastToggle = now - lastToggleTimeRef.current;

      if (timeSinceLastToggle < 500) {
        // User is toggling multiple files in rapid succession
        toggleCountRef.current++;
      } else {
        // Reset counter for new sequence
        toggleCountRef.current = 1;
      }

      // Update last toggle time
      lastToggleTimeRef.current = now;

      setManagedFilesMap((prevMap: FilesMap) => {
        const fileInfo = prevMap[path];
        if (!fileInfo) return prevMap;

        // Create new map with updated file info
        return {
          ...prevMap,
          [path]: {
            ...fileInfo,
            included: !fileInfo.included,
            // If forcibly including, remove from force-excluded
            forceExcluded: fileInfo.included ? fileInfo.forceExcluded : false,
          },
        };
      });

      // Find the normalized path for this file
      const fileInfo = managedFilesMap[path];
      if (!fileInfo) return;

      const normalizedPath =
        fileInfo.comparablePath || (await normalizePathForComparison(path));

      // Calculate the new included and excluded files
      if (fileInfo.included) {
        // If it was included, now we're un-including it
        // We need to handle the async operations properly by mapping to get normalized paths first
        const normalizedIncludedPaths = await Promise.all(
          currentIncludedFiles.map((p) => normalizePathForComparison(p))
        );

        // Then filter the paths that don't match normalizedPath
        const newIncludedFiles = currentIncludedFiles.filter(
          (_, index) => normalizedIncludedPaths[index] !== normalizedPath
        );
        onUpdateIncludedFiles(newIncludedFiles);
      } else {
        // If it wasn't included, now we're including it
        // Also ensure it's removed from excluded files if it was there
        const newIncludedFiles = [...currentIncludedFiles, normalizedPath];
        onUpdateIncludedFiles(newIncludedFiles);

        // Remove from excluded if needed
        // We need to handle the async operations properly by mapping to get normalized paths first
        const normalizedExcludedPaths = await Promise.all(
          currentExcludedFiles.map((p) => normalizePathForComparison(p))
        );

        // Then filter the paths that don't match normalizedPath
        const newExcludedFiles = currentExcludedFiles.filter(
          (_, index) => normalizedExcludedPaths[index] !== normalizedPath
        );
        if (newExcludedFiles.length !== currentExcludedFiles.length) {
          onUpdateExcludedFiles(newExcludedFiles);
        }
      }
    },
    [
      managedFilesMap,
      currentIncludedFiles,
      currentExcludedFiles,
      onUpdateIncludedFiles,
      onUpdateExcludedFiles,
    ]
  );

  const toggleFileExclusion = useCallback(
    async (path: string) => {
      // Track rapid consecutive toggles to detect potential click storms
      const now = Date.now();
      const timeSinceLastToggle = now - lastToggleTimeRef.current;

      if (timeSinceLastToggle < 500) {
        // User is toggling multiple files in rapid succession
        toggleCountRef.current++;
      } else {
        // Reset counter for new sequence
        toggleCountRef.current = 1;
      }

      // Update last toggle time
      lastToggleTimeRef.current = now;

      setManagedFilesMap((prevMap: FilesMap) => {
        const fileInfo = prevMap[path];
        if (!fileInfo) return prevMap;

        // Create new map with updated file info
        return {
          ...prevMap,
          [path]: {
            ...fileInfo,
            included: false, // Always unselect when force excluding
            forceExcluded: !fileInfo.forceExcluded,
          },
        };
      });

      // Find the normalized path for this file
      const fileInfo = managedFilesMap[path];
      if (!fileInfo) return;

      const normalizedPath =
        fileInfo.comparablePath || (await normalizePathForComparison(path));

      // Calculate the new included and excluded files based on the new state
      if (fileInfo.forceExcluded) {
        // If it was excluded, now we're un-excluding it
        // We need to handle the async operations properly by mapping to get normalized paths first
        const normalizedExcludedPaths = await Promise.all(
          currentExcludedFiles.map((p) => normalizePathForComparison(p))
        );

        // Then filter the paths that don't match normalizedPath
        const newExcludedFiles = currentExcludedFiles.filter(
          (_, index) => normalizedExcludedPaths[index] !== normalizedPath
        );
        onUpdateExcludedFiles(newExcludedFiles);
      } else {
        // If it wasn't excluded, now we're excluding it
        // Also ensure it's removed from included files
        const newExcludedFiles = [...currentExcludedFiles, normalizedPath];
        onUpdateExcludedFiles(newExcludedFiles);

        // Remove from included
        // We need to handle the async operations properly by mapping to get normalized paths first
        const normalizedIncludedPaths = await Promise.all(
          currentIncludedFiles.map((p) => normalizePathForComparison(p))
        );

        // Then filter the paths that don't match normalizedPath
        const newIncludedFiles = currentIncludedFiles.filter(
          (_, index) => normalizedIncludedPaths[index] !== normalizedPath
        );
        onUpdateIncludedFiles(newIncludedFiles);
      }
    },
    [
      managedFilesMap,
      currentIncludedFiles,
      currentExcludedFiles,
      onUpdateIncludedFiles,
      onUpdateExcludedFiles,
    ]
  );

  const handleBulkToggle = useCallback(
    async (shouldInclude: boolean, targetFiles: FileInfo[]) => {
      // Record this operation's time
      const now = Date.now();
      lastBulkOperationTimeRef.current = now;
      bulkOperationCountRef.current++;

      // Use deep cloned objects to avoid any reference issues
      const safeTargetFiles = JSON.parse(
        JSON.stringify(targetFiles)
      ) as FileInfo[];

      // Process the file map update
      setManagedFilesMap((prevMap: FilesMap) => {
        // Deep clone the previous map to ensure we don't have reference issues
        const newMap = JSON.parse(JSON.stringify(prevMap)) as Record<string, FileSelection>;

        // Update each filtered file
        safeTargetFiles.forEach((file) => {
          const filePath = file.path;
          if (filePath && newMap[filePath]) {
            // Skip if already in the desired state for 'included' and 'forceExcluded' is compatible
            if (
              newMap[filePath].included === shouldInclude &&
              (shouldInclude ? !newMap[filePath].forceExcluded : true)
            ) {
              return;
            }

            newMap[filePath] = {
              ...newMap[filePath],
              included: shouldInclude,
              // If including, make sure not force excluded
              forceExcluded: shouldInclude
                ? false
                : newMap[filePath].forceExcluded,
            };
          }
        });

        return newMap;
      });

      // Calculate the new included and excluded file sets based on the bulk operation
      const changedPathsPromises = safeTargetFiles.map(async (file) => {
        const path = file.path;
        const fileInfo = managedFilesMap[path];
        if (!fileInfo) return null;
        return (
          fileInfo.comparablePath || (await normalizePathForComparison(path))
        );
      });

      const changedPaths = (await Promise.all(changedPathsPromises)).filter(
        Boolean
      ) as string[];

      if (shouldInclude) {
        // Adding files to included set
        const newIncludedFiles = [
          ...new Set([...currentIncludedFiles, ...changedPaths]),
        ];
        onUpdateIncludedFiles(newIncludedFiles);

        // Remove from excluded if needed
        // We need to handle the async operations properly by mapping to get normalized paths first
        const normalizedExcludedPaths = await Promise.all(
          currentExcludedFiles.map((path) => normalizePathForComparison(path))
        );

        // Then filter the paths that are not in changedPaths
        const newExcludedFiles = currentExcludedFiles.filter(
          (_, index) => !changedPaths.includes(normalizedExcludedPaths[index])
        );
        if (newExcludedFiles.length !== currentExcludedFiles.length) {
          onUpdateExcludedFiles(newExcludedFiles);
        }
      } else {
        // Removing files from included set
        // We need to handle the async operations properly by mapping to get normalized paths first
        const normalizedIncludedPaths = await Promise.all(
          currentIncludedFiles.map((path) => normalizePathForComparison(path))
        );

        // Then filter the paths that are not in changedPaths
        const newIncludedFiles = currentIncludedFiles.filter(
          (_, index) => !changedPaths.includes(normalizedIncludedPaths[index])
        );
        onUpdateIncludedFiles(newIncludedFiles);
      }
    },
    [
      managedFilesMap,
      currentIncludedFiles,
      currentExcludedFiles,
      onUpdateIncludedFiles,
      onUpdateExcludedFiles,
    ]
  );

  // Helper function moved to managed-files-map-utils.ts

  // Store previous calculated map to avoid unnecessary updates
  const prevCalculatedMapRef = useRef<FilesMap>({});
  // Removed unused ref: isProcessingUpdateRef

  // Core effect to update managedFilesMap based on props
  useEffect(() => {
    // Check if we might be in a session deletion scenario
    // Session deletion typically results in both arrays becoming empty at once
    const isPossibleSessionDeletion =
      currentIncludedFiles.length === 0 &&
      currentExcludedFiles.length === 0 &&
      (prevIncludedFilesLengthRef.current > 0 ||
        prevExcludedFilesLengthRef.current > 0);

    // If this looks like a session deletion, set the flag
    if (isPossibleSessionDeletion && !isSessionDeletionRef.current) {
      isSessionDeletionRef.current = true;

      // Update refs to avoid repeated detection
      prevIncludedFilesLengthRef.current = 0;
      prevExcludedFilesLengthRef.current = 0;

      // Skip this render cycle to break potential infinite loop
      return;
    }

    // Reset the deletion flag if we have files again (new session loaded)
    if (
      (currentIncludedFiles.length > 0 || currentExcludedFiles.length > 0) &&
      isSessionDeletionRef.current
    ) {
      isSessionDeletionRef.current = false;
    }

    // Update tracking refs for next time
    prevIncludedFilesLengthRef.current = currentIncludedFiles.length;
    prevExcludedFilesLengthRef.current = currentExcludedFiles.length;

    // CASE 1: No project files loaded yet - nothing to process
    if (Object.keys(rawFilesMap).length === 0) {
      return;
    }

    // Break potential infinite update loops during session deletion
    if (isSessionDeletionRef.current) {
      return;
    }

    const newManagedFilesMap = calculateManagedFilesMap(
      rawFilesMap,
      currentIncludedFiles,
      currentExcludedFiles
    );

    // Only update state if the map has actually changed
    // This prevents infinite update loops by avoiding unnecessary state updates
    if (!areFileMapsEqual(newManagedFilesMap, managedFilesMap)) {
      prevCalculatedMapRef.current = newManagedFilesMap;
      setManagedFilesMap(newManagedFilesMap);
    }
  }, [
    rawFilesMap,
    currentIncludedFiles,
    currentExcludedFiles,
    managedFilesMap,
  ]);

  // Calculate derived state directly based on managedFilesMap
  const { includedPaths, excludedPaths } = useMemo(() => {
    const included = Object.values(managedFilesMap)
      .filter((f) => f.included && !f.forceExcluded)
      .map((f) => f.path);

    const excluded = Object.values(managedFilesMap)
      .filter((f) => f.forceExcluded)
      .map((f) => f.path);

    return { includedPaths: included, excludedPaths: excluded };
  }, [managedFilesMap]);

  const reset = useCallback(() => {
    setManagedFilesMap({});

    // Reset counter refs
    toggleCountRef.current = 0;
    lastToggleTimeRef.current = 0;
    bulkOperationCountRef.current = 0;
    lastBulkOperationTimeRef.current = 0;

    // Reset session deletion detection refs
    isSessionDeletionRef.current = false;
    prevIncludedFilesLengthRef.current = 0;
    prevExcludedFilesLengthRef.current = 0;
  }, []);

  return {
    managedFilesMap,
    includedPaths,
    excludedPaths,
    toggleFileSelection,
    toggleFileExclusion,
    handleBulkToggle,
    reset,
  };
}
