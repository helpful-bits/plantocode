"use client";

import { useCallback, useMemo } from "react";

import { calculateManagedFilesMap } from "./_utils/managed-files-map-utils";
import { type FilesMap } from "./use-project-file-list";

import type { FileInfo } from "@/types";

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
  // Calculate managedFilesMap as derived state
  const managedFilesMap = useMemo(() => 
    calculateManagedFilesMap(rawFilesMap, currentIncludedFiles, currentExcludedFiles),
    [rawFilesMap, currentIncludedFiles, currentExcludedFiles]
  );

  // File selection handlers
  const toggleFileSelection = useCallback(
    (path: string) => {
      const fileInfo = managedFilesMap[path];
      if (!fileInfo) return;

      const targetComparablePath = fileInfo.comparablePath;
      if (!targetComparablePath) {
        console.error(`[useFileSelectionCore] Missing comparablePath for file: ${path}`);
        return;
      }

      if (fileInfo.included) {
        // If it was included, now un-including it
        const newIncludedFiles = currentIncludedFiles.filter(p => p !== targetComparablePath);
        onUpdateIncludedFiles(newIncludedFiles);
      } else {
        // If it wasn't included, now including it
        const newIncludedFiles = Array.from(new Set([...currentIncludedFiles, targetComparablePath]));
        const newExcludedFiles = currentExcludedFiles.filter(p => p !== targetComparablePath);
        
        onUpdateIncludedFiles(newIncludedFiles);
        
        // Only update excluded files if there was a change
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
    (path: string) => {
      const fileInfo = managedFilesMap[path];
      if (!fileInfo) return;

      const targetComparablePath = fileInfo.comparablePath;
      if (!targetComparablePath) {
        console.error(`[useFileSelectionCore] Missing comparablePath for file: ${path}`);
        return;
      }

      if (fileInfo.forceExcluded) {
        // If it was excluded, now un-excluding it
        const newExcludedFiles = currentExcludedFiles.filter(p => p !== targetComparablePath);
        onUpdateExcludedFiles(newExcludedFiles);
      } else {
        // If it wasn't excluded, now excluding it
        const newExcludedFiles = Array.from(new Set([...currentExcludedFiles, targetComparablePath]));
        const newIncludedFiles = currentIncludedFiles.filter(p => p !== targetComparablePath);
        
        onUpdateExcludedFiles(newExcludedFiles);
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
    (shouldInclude: boolean, targetFiles: FileInfo[]) => {
      const targetComparablePaths = targetFiles
        .map(f => f.comparablePath)
        .filter(Boolean) as string[];

      if (shouldInclude) {
        // Adding files to included set
        const newIncludedFiles = Array.from(new Set([...currentIncludedFiles, ...targetComparablePaths]));
        const newExcludedFiles = currentExcludedFiles.filter(p => !targetComparablePaths.includes(p));
        
        onUpdateIncludedFiles(newIncludedFiles);
        onUpdateExcludedFiles(newExcludedFiles);
      } else {
        // Removing files from included set
        const newIncludedFiles = currentIncludedFiles.filter(p => !targetComparablePaths.includes(p));
        onUpdateIncludedFiles(newIncludedFiles);
      }
    },
    [
      currentIncludedFiles,
      currentExcludedFiles,
      onUpdateIncludedFiles,
      onUpdateExcludedFiles,
    ]
  );

  // Calculate derived state directly based on managedFilesMap
  const { includedPaths, excludedPaths } = useMemo(() => {
    const included = Object.values(managedFilesMap)
      .filter((f) => f.included && !f.forceExcluded)
      .map((f) => f.comparablePath)
      .filter(Boolean) as string[];

    const excluded = Object.values(managedFilesMap)
      .filter((f) => f.forceExcluded)
      .map((f) => f.comparablePath)
      .filter(Boolean) as string[];

    return { includedPaths: included, excludedPaths: excluded };
  }, [managedFilesMap]);

  const reset = useCallback(() => {
    // Reset by clearing the session data
    onUpdateIncludedFiles([]);
    onUpdateExcludedFiles([]);
  }, [onUpdateIncludedFiles, onUpdateExcludedFiles]);

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