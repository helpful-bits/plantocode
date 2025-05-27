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
  pushHistory: (currentIncluded: string[], currentExcluded: string[]) => void;
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
  pushHistory,
}: UseFileSelectionCoreProps) {
  // Calculate managedFilesMap as derived state
  const managedFilesMap = useMemo(() => 
    calculateManagedFilesMap(rawFilesMap, currentIncludedFiles, currentExcludedFiles),
    [rawFilesMap, currentIncludedFiles, currentExcludedFiles]
  );

  // File selection handlers
  const toggleFileSelection = useCallback(
    (path: string) => {
      if (!path || typeof path !== 'string') {
        console.error(`[useFileSelectionCore] Invalid path provided: ${path}`);
        return;
      }
      
      const fileInfo = managedFilesMap[path];
      if (!fileInfo) {
        console.warn(`[useFileSelectionCore] File not found in managedFilesMap: ${path}`);
        return;
      }

      const targetComparablePath = fileInfo.comparablePath;
      if (!targetComparablePath) {
        console.error(`[useFileSelectionCore] Missing comparablePath for file: ${path}`);
        return;
      }

      // Save current state before making changes
      // Note: currentIncludedFiles and currentExcludedFiles represent the state *before* this toggle action
      // This is the correct behavior for history tracking - we capture the "before" state for undo operations
      pushHistory(currentIncludedFiles, currentExcludedFiles);

      if (fileInfo.included) {
        // If it was included, now excluding it (mutually exclusive behavior)
        const newIncludedFiles = currentIncludedFiles.filter(p => p !== targetComparablePath);
        const newExcludedFiles = Array.from(new Set([...currentExcludedFiles, targetComparablePath]));
        
        onUpdateIncludedFiles(newIncludedFiles);
        onUpdateExcludedFiles(newExcludedFiles);
      } else {
        // If it wasn't included, now including it and removing from excluded
        const newIncludedFiles = Array.from(new Set([...currentIncludedFiles, targetComparablePath]));
        const newExcludedFiles = currentExcludedFiles.filter(p => p !== targetComparablePath);
        
        onUpdateIncludedFiles(newIncludedFiles);
        onUpdateExcludedFiles(newExcludedFiles);
      }
    },
    [
      managedFilesMap,
      currentIncludedFiles,
      currentExcludedFiles,
      onUpdateIncludedFiles,
      onUpdateExcludedFiles,
      pushHistory,
    ]
  );

  const toggleFileExclusion = useCallback(
    (path: string) => {
      if (!path || typeof path !== 'string') {
        console.error(`[useFileSelectionCore] Invalid path provided: ${path}`);
        return;
      }
      
      const fileInfo = managedFilesMap[path];
      if (!fileInfo) {
        console.warn(`[useFileSelectionCore] File not found in managedFilesMap: ${path}`);
        return;
      }

      const targetComparablePath = fileInfo.comparablePath;
      if (!targetComparablePath) {
        console.error(`[useFileSelectionCore] Missing comparablePath for file: ${path}`);
        return;
      }

      // Save current state before making changes
      // Note: currentIncludedFiles and currentExcludedFiles represent the state *before* this toggle action
      // This is the correct behavior for history tracking - we capture the "before" state for undo operations
      pushHistory(currentIncludedFiles, currentExcludedFiles);

      if (fileInfo.forceExcluded) {
        // If it was excluded, now including it (mutually exclusive behavior)
        const newExcludedFiles = currentExcludedFiles.filter(p => p !== targetComparablePath);
        const newIncludedFiles = Array.from(new Set([...currentIncludedFiles, targetComparablePath]));
        
        onUpdateExcludedFiles(newExcludedFiles);
        onUpdateIncludedFiles(newIncludedFiles);
      } else {
        // If it wasn't excluded, now excluding it and removing from included
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
      pushHistory,
    ]
  );

  const handleBulkToggle = useCallback(
    (shouldInclude: boolean, targetFiles: FileInfo[]) => {
      if (!Array.isArray(targetFiles) || targetFiles.length === 0) {
        console.warn('[useFileSelectionCore] No valid files provided for bulk toggle');
        return;
      }
      
      const targetComparablePaths = targetFiles
        .map(f => f?.comparablePath)
        .filter((path): path is string => Boolean(path));

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

  return useMemo(
    () => ({
      managedFilesMap,
      includedPaths,
      excludedPaths,
      toggleFileSelection,
      toggleFileExclusion,
      handleBulkToggle,
      reset,
    }),
    [
      managedFilesMap,
      includedPaths,
      excludedPaths,
      toggleFileSelection,
      toggleFileExclusion,
      handleBulkToggle,
      reset,
    ]
  );
}