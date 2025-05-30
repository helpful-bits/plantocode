"use client";

import { useState, useCallback, useRef, useMemo } from "react";

import { type FilesMap } from "./use-project-file-list";
import { ensureProjectRelativePath } from "@/utils/path-utils";

interface UseExternalPathHandlerProps {
  managedFilesMap: FilesMap;
  currentIncludedFiles: string[];
  currentExcludedFiles: string[];
  onUpdateIncludedFiles: (paths: string[]) => void;
  onUpdateExcludedFiles: (paths: string[]) => void;
  pushHistory: (currentIncluded: string[], currentExcluded: string[]) => void;
}

/**
 * Hook to handle adding external file paths to selection
 */
export function useExternalPathHandler({
  managedFilesMap,
  currentIncludedFiles,
  currentExcludedFiles,
  onUpdateIncludedFiles,
  onUpdateExcludedFiles,
  pushHistory,
}: UseExternalPathHandlerProps) {
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>(
    []
  );

  // Track pending bulk operations
  const bulkOperationCountRef = useRef(0);
  const lastBulkOperationTimeRef = useRef(0);

  // Clear warnings
  const clearExternalPathWarnings = useCallback(() => {
    if (externalPathWarnings.length > 0) {
      setExternalPathWarnings([]);
    }
  }, [externalPathWarnings]);

  // Helper to normalize paths for consistent comparison
  const normalizePaths = (paths: string[]): Set<string> => {
    return new Set(
      paths
        .map((path) => {
          if (!path) return "";
          return ensureProjectRelativePath(path);
        })
        .filter(Boolean)
    ); // Filter out empty strings
  };

  // Build efficient indices for file lookups
  const buildFilePathIndex = (
    filesMap: FilesMap
  ): {
    byComparablePath: Map<string, string>;
  } => {
    const byComparablePath = new Map<string, string>(); // Map comparablePath -> actual path

    for (const [path, fileInfo] of Object.entries(filesMap)) {
      // Store by comparable path (main lookup method)
      const comparablePath = fileInfo.comparablePath || path;
      byComparablePath.set(comparablePath, path);
    }

    return { byComparablePath };
  };

  // Apply selections from paths (add to existing selection)
  const applySelectionsFromPaths = useCallback(
    (paths: string[], options?: { mergeWithExisting?: boolean }) => {
      if (!paths || paths.length === 0) {
        return;
      }

      // Whether to merge with existing selections (default is true - always merge)
      const mergeWithExisting = options?.mergeWithExisting ?? true;

      // Save current state to history before making changes
      pushHistory(currentIncludedFiles, currentExcludedFiles);

      const warnings: string[] = [];
      const newIncludedSet = new Set(mergeWithExisting ? currentIncludedFiles : []);
      const newExcludedSet = new Set(currentExcludedFiles);

      // Create a map from comparablePath to actual path for efficient lookup
      const comparableToActualPathMap = new Map<string, string>();
      for (const [actualPathKey, fileInfo] of Object.entries(managedFilesMap)) {
        if (fileInfo.comparablePath) {
          comparableToActualPathMap.set(fileInfo.comparablePath, actualPathKey);
        }
      }

      paths.forEach((inputComparablePath: string) => {
        // The input paths are already normalized by normalizePath
        if (comparableToActualPathMap.has(inputComparablePath)) {
          // Add to included set (it's a Set, so duplicates are handled)
          newIncludedSet.add(inputComparablePath);
          // Remove from excluded set if it was there
          newExcludedSet.delete(inputComparablePath);
        } else {
          warnings.push(`Path not found: ${inputComparablePath}`);
        }
      });

      if (warnings.length > 0) {
        setExternalPathWarnings(warnings);
      }

      const finalIncludedPaths = Array.from(newIncludedSet);
      const finalExcludedPaths = Array.from(newExcludedSet);

      // Only call update if there's a change (use shallow comparison for better performance)
      const hasIncludedChanges = finalIncludedPaths.length !== currentIncludedFiles.length || 
        finalIncludedPaths.some((path, index) => path !== currentIncludedFiles[index]);
      const hasExcludedChanges = finalExcludedPaths.length !== currentExcludedFiles.length || 
        finalExcludedPaths.some((path, index) => path !== currentExcludedFiles[index]);
        
      if (hasIncludedChanges) {
        onUpdateIncludedFiles(finalIncludedPaths);
      }
      if (hasExcludedChanges) {
        onUpdateExcludedFiles(finalExcludedPaths);
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

  // Replace all selections with new paths
  const replaceAllSelectionsWithPaths = useCallback(
    (newPaths: string[]) => {
      if (!newPaths || newPaths.length === 0) {
        return;
      }

      // Save current state to history before making changes
      pushHistory(currentIncludedFiles, currentExcludedFiles);

      // Record this operation's time for rate limiting
      const now = Date.now();
      lastBulkOperationTimeRef.current = now;
      bulkOperationCountRef.current++;

      // Performance optimization: Build indices for faster lookups
      const fileIndices = buildFilePathIndex(managedFilesMap);

      // Matched paths will be collected here and used after UI update
      const matchedNormalizedPaths: string[] = [];
      const pathMatchingSet = new Set<string>(); // For tracking duplicates

      // Normalize all paths in newPaths
      const normalizedPaths = normalizePaths(newPaths);
      const warnings: string[] = [];

      // Track matched paths efficiently without copying entire map
      const matchedFileUpdates = new Map<string, { included: boolean; forceExcluded: boolean }>();
      const matchedPaths = new Set<string>(); // Track matched paths to avoid duplicates

      // Mark all non-force-excluded files for exclusion in our update map
      for (const [path, fileInfo] of Object.entries(managedFilesMap)) {
        if (!fileInfo.forceExcluded) {
          matchedFileUpdates.set(path, { included: false, forceExcluded: false });
        }
      }

      // Then iterate over the normalized paths and set those that exist in the map to included
      for (const normalizedPath of normalizedPaths) {
        let found = false;
        let matchedPath = null;

        // Optimization: Check most common match patterns first

        // 1. Direct comparable path match (fastest)
        if (fileIndices.byComparablePath.has(normalizedPath)) {
          matchedPath = fileIndices.byComparablePath.get(normalizedPath);
          if (matchedPath && !matchedPaths.has(matchedPath)) {
            matchedFileUpdates.set(matchedPath, { included: true, forceExcluded: false });
            found = true;
            matchedPaths.add(matchedPath);

            // Ensure we add the *comparablePath* of the matched file to matchedNormalizedPaths
            const fileInfo = managedFilesMap[matchedPath];
            if (fileInfo?.comparablePath && !pathMatchingSet.has(fileInfo.comparablePath)) {
              matchedNormalizedPaths.push(fileInfo.comparablePath);
              pathMatchingSet.add(fileInfo.comparablePath);
            }
          }
        }

        if (!found) {
          warnings.push(`Path not found: ${normalizedPath}`);
        }
      }

      if (warnings.length > 0) {
        setExternalPathWarnings(warnings);
      }

      // Always replace with exactly the matched paths
      onUpdateIncludedFiles(matchedNormalizedPaths);
    },
    [
      managedFilesMap,
      onUpdateIncludedFiles,
      pushHistory,
      currentIncludedFiles,
      currentExcludedFiles,
    ]
  );

  const reset = useCallback(() => {
    setExternalPathWarnings([]);
    bulkOperationCountRef.current = 0;
    lastBulkOperationTimeRef.current = 0;
  }, []);

  return useMemo(
    () => ({
      externalPathWarnings,
      clearExternalPathWarnings,
      applySelectionsFromPaths,
      replaceAllSelectionsWithPaths,
      reset,
    }),
    [
      externalPathWarnings,
      clearExternalPathWarnings,
      applySelectionsFromPaths,
      replaceAllSelectionsWithPaths,
      reset,
    ]
  );
}
