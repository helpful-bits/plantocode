"use client";

import { useState, useCallback, useRef } from "react";

import { type FilesMap } from "./use-project-file-list";

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

          // Use a standardized normalization approach
          // This matches the normalizePathForComparison function but inline for efficiency
          let normalizedPath = path.trim();
          normalizedPath = normalizedPath.replace(/\\/g, "/");
          normalizedPath = normalizedPath.replace(/\/\/+/g, "/");

          // Remove leading ./ if present
          if (normalizedPath.startsWith("./")) {
            normalizedPath = normalizedPath.substring(2);
          }

          // Remove leading / if present (assuming paths are relative to project root)
          if (normalizedPath.startsWith("/")) {
            normalizedPath = normalizedPath.substring(1);
          }

          return normalizedPath;
        })
        .filter(Boolean)
    ); // Filter out empty strings
  };

  // Build efficient indices for file lookups
  const buildFilePathIndex = (
    filesMap: FilesMap
  ): {
    byComparablePath: Map<string, string>;
    byFileName: Map<string, string[]>;
    byPath: Map<string, string>;
  } => {
    const byComparablePath = new Map<string, string>(); // Map comparablePath -> actual path
    const byFileName = new Map<string, string[]>(); // Map filename -> array of paths
    const byPath = new Map<string, string>(); // Map actual path -> actual path (for direct lookup)

    for (const [path, fileInfo] of Object.entries(filesMap)) {
      // Store by comparable path (main lookup method)
      const comparablePath = fileInfo.comparablePath || path;
      byComparablePath.set(comparablePath, path);

      // Store by path directly
      byPath.set(path, path);

      // Store by filename for fallback lookup
      const fileName = path.split("/").pop() || "";
      if (fileName) {
        if (!byFileName.has(fileName)) {
          byFileName.set(fileName, []);
        }
        byFileName.get(fileName)?.push(path);
      }
    }

    return { byComparablePath, byFileName, byPath };
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

      // Find matching file paths in managedFilesMap
      const warnings: string[] = [];
      const matchedPaths: string[] = [];
      const updatedMap: FilesMap = { ...managedFilesMap };

      // Mark each path as included
      paths.forEach((path: string) => {
        // path is already normalized by normalizePathForComparison in PastePaths component
        const normalizedInputPath = path; // Already normalized

        if (updatedMap[path]) {
          updatedMap[path] = {
            ...updatedMap[path],
            included: true,
            forceExcluded: false,
          };
          matchedPaths.push(path);
        } else {
          // Try to find a matching file using the comparablePath property
          let found = false;

          // First try: Direct match using comparablePath
          for (const mapPath of Object.keys(updatedMap)) {
            const fileInfo = updatedMap[mapPath];

            if (fileInfo.comparablePath === normalizedInputPath) {
              updatedMap[mapPath] = {
                ...updatedMap[mapPath],
                included: true,
                forceExcluded: false,
              };
              matchedPaths.push(mapPath);
              found = true;
              break;
            }
          }

          // Second try: Path ends with the input path (handles project-relative paths)
          if (!found) {
            for (const mapPath of Object.keys(updatedMap)) {
              const fileInfo = updatedMap[mapPath];

              if (
                normalizedInputPath &&
                fileInfo.comparablePath.endsWith("/" + normalizedInputPath)
              ) {
                updatedMap[mapPath] = {
                  ...updatedMap[mapPath],
                  included: true,
                  forceExcluded: false,
                };
                matchedPaths.push(mapPath);
                found = true;
                break;
              }
            }
          }

          // Third try: Input path contains the map path (for scenarios where the full absolute path is pasted)
          if (!found) {
            for (const mapPath of Object.keys(updatedMap)) {
              const fileInfo = updatedMap[mapPath];

              if (normalizedInputPath.includes(fileInfo.comparablePath)) {
                updatedMap[mapPath] = {
                  ...updatedMap[mapPath],
                  included: true,
                  forceExcluded: false,
                };
                matchedPaths.push(mapPath);
                found = true;
                break;
              }
            }
          }

          if (!found) {
            warnings.push(`Path not found: ${path}`);
          }
        }
      });

      if (warnings.length > 0) {
        setExternalPathWarnings(warnings);
      }

      // Update the session with new included files based on merge option
      const newIncludedFiles = mergeWithExisting
        ? [...new Set([...currentIncludedFiles, ...matchedPaths])] // Merge with existing
        : [...matchedPaths]; // Replace existing

      onUpdateIncludedFiles(newIncludedFiles);

      // Also ensure these files are removed from excluded files if they were there
      const newExcludedFiles = currentExcludedFiles.filter(
        (path) => !matchedPaths.includes(path)
      );
      if (newExcludedFiles.length !== currentExcludedFiles.length) {
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

      // Create a copy of managedFilesMap that we'll update
      const updatedMap = { ...managedFilesMap };
      const matchedPaths = new Set<string>(); // Track matched paths to avoid duplicates

      // Reset all files to not included (except force excluded ones)
      for (const path of Object.keys(updatedMap)) {
        if (!updatedMap[path].forceExcluded) {
          updatedMap[path] = {
            ...updatedMap[path],
            included: false,
          };
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
            updatedMap[matchedPath] = {
              ...updatedMap[matchedPath],
              included: true,
              forceExcluded: false,
            };
            found = true;
            matchedPaths.add(matchedPath);

            // Also add to our outer matched paths collection
            const normalizedMatchedPath =
              updatedMap[matchedPath].comparablePath || normalizedPath;
            if (!pathMatchingSet.has(normalizedMatchedPath)) {
              matchedNormalizedPaths.push(normalizedMatchedPath);
              pathMatchingSet.add(normalizedMatchedPath);
            }
          }
        }

        // 2. Path ends with the input path (common for relative paths)
        if (!found) {
          for (const [
            comparablePath,
            actualPath,
          ] of fileIndices.byComparablePath.entries()) {
            if (
              !matchedPaths.has(actualPath) &&
              normalizedPath &&
              comparablePath.endsWith("/" + normalizedPath)
            ) {
              updatedMap[actualPath] = {
                ...updatedMap[actualPath],
                included: true,
                forceExcluded: false,
              };
              found = true;
              matchedPaths.add(actualPath);

              // Also add to our outer matched paths collection
              if (!pathMatchingSet.has(comparablePath)) {
                matchedNormalizedPaths.push(comparablePath);
                pathMatchingSet.add(comparablePath);
              }
              break;
            }
          }
        }

        // 3. Filename match (fallback for less specific paths)
        if (!found) {
          const fileName = normalizedPath.split("/").pop() || "";
          if (fileName && fileIndices.byFileName.has(fileName)) {
            const candidates = fileIndices.byFileName.get(fileName) || [];

            // If we have a single match by filename, use it
            if (candidates.length === 1 && !matchedPaths.has(candidates[0])) {
              const actualPath = candidates[0];
              updatedMap[actualPath] = {
                ...updatedMap[actualPath],
                included: true,
                forceExcluded: false,
              };
              found = true;
              matchedPaths.add(actualPath);

              // Also add to our outer matched paths collection
              const normalizedMatchedPath =
                updatedMap[actualPath].comparablePath || normalizedPath;
              if (!pathMatchingSet.has(normalizedMatchedPath)) {
                matchedNormalizedPaths.push(normalizedMatchedPath);
                pathMatchingSet.add(normalizedMatchedPath);
              }
            }
            // If multiple matches, try to find the best one by path similarity
            else if (candidates.length > 1) {
              // Find best match by comparing common path segments
              // E.g., if normalizedPath is "src/utils/helper.js", prefer matches with more path parts in common
              const pathParts = normalizedPath.split("/");
              let bestMatch = null;
              let bestMatchScore = 0;

              for (const candidatePath of candidates) {
                if (matchedPaths.has(candidatePath)) continue;

                const candidateParts = candidatePath.split("/");
                let matchScore = 0;

                // Count matching segments from the end (filename always matches)
                for (
                  let i = 1;
                  i <= Math.min(pathParts.length, candidateParts.length);
                  i++
                ) {
                  if (
                    pathParts[pathParts.length - i] ===
                    candidateParts[candidateParts.length - i]
                  ) {
                    matchScore++;
                  } else {
                    break; // Stop at first non-match
                  }
                }

                if (matchScore > bestMatchScore) {
                  bestMatchScore = matchScore;
                  bestMatch = candidatePath;
                }
              }

              if (bestMatch) {
                updatedMap[bestMatch] = {
                  ...updatedMap[bestMatch],
                  included: true,
                  forceExcluded: false,
                };
                found = true;
                matchedPaths.add(bestMatch);

                // Also add to our outer matched paths collection
                const normalizedMatchedPath =
                  updatedMap[bestMatch].comparablePath || normalizedPath;
                if (!pathMatchingSet.has(normalizedMatchedPath)) {
                  matchedNormalizedPaths.push(normalizedMatchedPath);
                  pathMatchingSet.add(normalizedMatchedPath);
                }
              }
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

  return {
    externalPathWarnings,
    clearExternalPathWarnings,
    applySelectionsFromPaths,
    replaceAllSelectionsWithPaths,
    reset,
  };
}
