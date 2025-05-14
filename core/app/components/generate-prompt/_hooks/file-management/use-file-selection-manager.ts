"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { FileInfo } from "@core/types";
import { FilesMap } from "./use-project-file-list";
import { makePathRelative, normalizePathForComparison } from "@core/lib/path-utils";

// Define a selection history item type
interface SelectionHistoryItem {
  included: string[];
  excluded: string[];
}

interface UseFileSelectionManagerProps {
  rawFilesMap: FilesMap;
  currentIncludedFiles: string[];
  currentExcludedFiles: string[];
  currentSearchTerm: string;
  currentSearchSelectedFilesOnly: boolean;
  onUpdateIncludedFiles: (paths: string[]) => void;
  onUpdateExcludedFiles: (paths: string[]) => void;
  onUpdateSearchTerm: (term: string) => void;
  onUpdateSearchSelectedOnly: (value: boolean) => void;
  isTransitioningSession?: boolean;
  activeSessionId?: string | null;
}

/**
 * Hook to manage file selections, search state, and external path handling
 */
export function useFileSelectionManager({
  rawFilesMap,
  currentIncludedFiles,
  currentExcludedFiles,
  currentSearchTerm,
  currentSearchSelectedFilesOnly,
  onUpdateIncludedFiles,
  onUpdateExcludedFiles,
  onUpdateSearchTerm,
  onUpdateSearchSelectedOnly,
  isTransitioningSession = false,
  activeSessionId = null
}: UseFileSelectionManagerProps) {

  const [managedFilesMap, setManagedFilesMap] = useState<FilesMap>({});
  const [showOnlySelected, setShowOnlySelectedInternal] = useState<boolean>(false);
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>([]);
  const [pastSelections, setPastSelections] = useState<SelectionHistoryItem[]>([]);
  const [futureSelections, setFutureSelections] = useState<SelectionHistoryItem[]>([]);

  const searchTerm = currentSearchTerm;
  const searchSelectedFilesOnly = currentSearchSelectedFilesOnly;

  // Helper function to push current selection state to history
  const pushHistory = useCallback((currentIncluded: string[], currentExcluded: string[]) => {
    // Only push to history if there are changes to track
    setPastSelections(prev => {
      // Limit history size to 20 entries for performance
      const updatedHistory = [...prev, { included: [...currentIncluded], excluded: [...currentExcluded] }];
      if (updatedHistory.length > 20) {
        return updatedHistory.slice(-20);
      }
      return updatedHistory;
    });

    // Clear future selections when a new change is made
    setFutureSelections([]);
  }, []);
  
  const prevIsTransitioningRef = useRef(isTransitioningSession);
  const prevSessionIdRef = useRef<string | null>(activeSessionId);
  useEffect(() => {
      const sessionChanged = prevSessionIdRef.current !== activeSessionId;
    const transitionStateChanged = prevIsTransitioningRef.current !== isTransitioningSession;
    if (sessionChanged) {
      prevSessionIdRef.current = activeSessionId;
    }

    if (transitionStateChanged) {
      prevIsTransitioningRef.current = isTransitioningSession;
    }
  }, [activeSessionId, isTransitioningSession]);


  const reset = useCallback(() => {
    setManagedFilesMap({});
    setShowOnlySelectedInternal(false);
    setExternalPathWarnings([]);
    setPastSelections([]);
    setFutureSelections([]);

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

  useEffect(() => {
    // Skip resets during transitions
    if (isTransitioningSession) {
      return;
    }

    // Only reset after the transition is complete (activeSessionId changed AND transition is done)
    if (activeSessionId !== prevSessionIdRef.current && prevSessionIdRef.current !== null && !isTransitioningSession) {
      reset();
    }

    // Update the ref for next comparison, but only when not transitioning
    if (!isTransitioningSession) {
      prevSessionIdRef.current = activeSessionId;
    }
  }, [activeSessionId, reset, isTransitioningSession]);
  
  const applySelectionsFromPaths = useCallback((paths: string[], options?: { mergeWithExisting?: boolean }) => {
    if (!paths || paths.length === 0) {
      return;
    }

    // Whether to merge with existing selections (default is true - always merge)
    const mergeWithExisting = options?.mergeWithExisting ?? true;

    // Save current state to history before making changes
    pushHistory(currentIncludedFiles, currentExcludedFiles);

    // Find matching file paths in rawFilesMap
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
          forceExcluded: false
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
              forceExcluded: false
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

            if (normalizedInputPath && fileInfo.comparablePath.endsWith('/' + normalizedInputPath)) {
              updatedMap[mapPath] = {
                ...updatedMap[mapPath],
                included: true,
                forceExcluded: false
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
                forceExcluded: false
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

    // Update the UI with the new state
    setManagedFilesMap(updatedMap);

    // Update the session with new included files based on merge option
    const newIncludedFiles = mergeWithExisting
      ? [...new Set([...currentIncludedFiles, ...matchedPaths])]  // Merge with existing
      : [...matchedPaths];  // Replace existing

    onUpdateIncludedFiles(newIncludedFiles);

    // Also ensure these files are removed from excluded files if they were there
    const newExcludedFiles = currentExcludedFiles.filter(path => !matchedPaths.includes(path));
    if (newExcludedFiles.length !== currentExcludedFiles.length) {
      onUpdateExcludedFiles(newExcludedFiles);
    }
  }, [managedFilesMap, currentIncludedFiles, currentExcludedFiles, onUpdateIncludedFiles, onUpdateExcludedFiles, pushHistory]);

  useEffect(() => {
    prevIsTransitioningRef.current = isTransitioningSession;
  }, [isTransitioningSession]);

  const clearExternalPathWarnings = useCallback(() => {
    if (externalPathWarnings.length > 0) {
        setExternalPathWarnings([]);
    }
  }, [externalPathWarnings]);

  const prevRawFilesMapKeysRef = useRef<string[]>([]);
  const isProcessingUpdateRef = useRef<boolean>(false);

  // Track previous values to detect session deletion
  const prevIncludedFilesLengthRef = useRef<number>(currentIncludedFiles.length);
  const prevExcludedFilesLengthRef = useRef<number>(currentExcludedFiles.length);
  const isSessionDeletionRef = useRef<boolean>(false);

  // Core effect to update managedFilesMap based on props
  // Helper function to check if maps are effectively equal
  const areFileMapsEqual = (map1: FilesMap, map2: FilesMap): boolean => {
    const keys1 = Object.keys(map1);
    const keys2 = Object.keys(map2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (const key of keys1) {
      if (!map2[key]) return false;
      
      const file1 = map1[key];
      const file2 = map2[key];
      
      // Only compare the relevant state properties that affect rendering
      if (file1.included !== file2.included || file1.forceExcluded !== file2.forceExcluded) {
        return false;
      }
    }
    
    return true;
  };
  
  // Store previous calculated map to avoid unnecessary updates
  const prevCalculatedMapRef = useRef<FilesMap>({});
  
  useEffect(() => {
    // Check if we might be in a session deletion scenario
    // Session deletion typically results in both arrays becoming empty at once
    const isPossibleSessionDeletion =
      currentIncludedFiles.length === 0 &&
      currentExcludedFiles.length === 0 &&
      (prevIncludedFilesLengthRef.current > 0 || prevExcludedFilesLengthRef.current > 0);

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
    if ((currentIncludedFiles.length > 0 || currentExcludedFiles.length > 0) && isSessionDeletionRef.current) {
      isSessionDeletionRef.current = false;
    }

    // Update tracking refs for next time
    prevIncludedFilesLengthRef.current = currentIncludedFiles.length;
    prevExcludedFilesLengthRef.current = currentExcludedFiles.length;

    // During transitions, we'll still process updates
    // CASE 1: No project files loaded yet - nothing to process
    if (Object.keys(rawFilesMap).length === 0) {
      return;
    }

    // Break potential infinite update loops during session deletion
    if (isSessionDeletionRef.current) {
      return;
    }

    // Create a new map based on rawFilesMap
    const newManagedFilesMap: FilesMap = {};

    // First pass: Copy all files from rawFilesMap
    for (const [path, fileInfo] of Object.entries(rawFilesMap)) {
      newManagedFilesMap[path] = {
        ...fileInfo,
        included: false, // Default to not included
        forceExcluded: false // Default to not force-excluded
      };
    }

    // Second pass: Apply session selections from props
    if (currentIncludedFiles.length || currentExcludedFiles.length) {

      // Apply included files from props
      if (currentIncludedFiles.length > 0) {
        // Process all included paths
        let matchedCount = 0;

        for (const includedPath of currentIncludedFiles) {
          let matched = false;

          // Normalize for consistent comparison
          const normalizedIncludedPath = normalizePathForComparison(includedPath);

          // Find matching file in our map
          for (const [path, fileInfo] of Object.entries(newManagedFilesMap)) {
            const comparablePath = fileInfo.comparablePath || normalizePathForComparison(path);

            // Check for exact match
            if (comparablePath === normalizedIncludedPath) {
              newManagedFilesMap[path] = {
                ...fileInfo,
                included: true,
                forceExcluded: false // If explicitly included, remove any force-exclude
              };
              matched = true;
              matchedCount++;
              break;
            }
          }
        }
      }

      // Apply excluded files from props
      if (currentExcludedFiles.length > 0) {
        // Process all excluded paths
        let matchedCount = 0;

        for (const excludedPath of currentExcludedFiles) {
          let matched = false;

          // Normalize for consistent comparison
          const normalizedExcludedPath = normalizePathForComparison(excludedPath);

          // Find matching file in our map
          for (const [path, fileInfo] of Object.entries(newManagedFilesMap)) {
            const comparablePath = fileInfo.comparablePath || normalizePathForComparison(path);

            // Check for exact match
            if (comparablePath === normalizedExcludedPath) {
              newManagedFilesMap[path] = {
                ...fileInfo,
                included: false, // Force to false
                forceExcluded: true // Mark as force-excluded
              };
              matched = true;
              matchedCount++;
              break;
            }
          }
        }
      }
    }

    // Only update state if the map has actually changed
    // This prevents infinite update loops by avoiding unnecessary state updates
    if (!areFileMapsEqual(newManagedFilesMap, managedFilesMap)) {
      prevCalculatedMapRef.current = newManagedFilesMap;
      setManagedFilesMap(newManagedFilesMap);
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawFilesMap, currentIncludedFiles, currentExcludedFiles, isTransitioningSession]);

  // Direct setters to update props
  const setSearchTerm = useCallback((value: string) => {
    onUpdateSearchTerm(value);
  }, [onUpdateSearchTerm]);

  const setShowOnlySelected = useCallback((value: boolean) => {
    setShowOnlySelectedInternal(value);
  }, []);

  // Simplified toggle function to update through props - this calls our debounced handler in the parent
  const toggleSearchSelectedFilesOnly = useCallback((value?: boolean) => {
    const newValue = typeof value === 'boolean' ? value : !searchSelectedFilesOnly;
    onUpdateSearchSelectedOnly(newValue);
  }, [searchSelectedFilesOnly, onUpdateSearchSelectedOnly]);

  // Track pending bulk operations
  const bulkOperationCountRef = useRef(0);
  const lastBulkOperationTimeRef = useRef(0);

  // Track consecutive individual toggles for improved batching
  const toggleCountRef = useRef(0);
  const lastToggleTimeRef = useRef(0);
  
  // File selection handlers that update via props
  const toggleFileSelection = useCallback((path: string) => {
    // Save current state to history before making changes
    pushHistory(currentIncludedFiles, currentExcludedFiles);

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

    setManagedFilesMap(prevMap => {
      const fileInfo = prevMap[path];
      if (!fileInfo) return prevMap;

      // Create new map with updated file info
      return {
        ...prevMap,
        [path]: {
          ...fileInfo,
          included: !fileInfo.included,
          // If forcibly including, remove from force-excluded
          forceExcluded: fileInfo.included ? fileInfo.forceExcluded : false
        }
      };
    });

    // Find the normalized path for this file
    const fileInfo = managedFilesMap[path];
    if (!fileInfo) return;

    const normalizedPath = fileInfo.comparablePath || normalizePathForComparison(path);

    // Calculate the new included and excluded files
    if (fileInfo.included) {
      // If it was included, now we're un-including it
      const newIncludedFiles = currentIncludedFiles.filter(p =>
        normalizePathForComparison(p) !== normalizedPath
      );
      onUpdateIncludedFiles(newIncludedFiles);
    } else {
      // If it wasn't included, now we're including it
      // Also ensure it's removed from excluded files if it was there
      const newIncludedFiles = [...currentIncludedFiles, normalizedPath];
      onUpdateIncludedFiles(newIncludedFiles);

      // Remove from excluded if needed
      const newExcludedFiles = currentExcludedFiles.filter(p =>
        normalizePathForComparison(p) !== normalizedPath
      );
      if (newExcludedFiles.length !== currentExcludedFiles.length) {
        onUpdateExcludedFiles(newExcludedFiles);
      }
    }
  }, [managedFilesMap, currentIncludedFiles, currentExcludedFiles, onUpdateIncludedFiles, onUpdateExcludedFiles, pushHistory]);

  const toggleFileExclusion = useCallback((path: string) => {
    // Save current state to history before making changes
    pushHistory(currentIncludedFiles, currentExcludedFiles);

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

    setManagedFilesMap(prevMap => {
      const fileInfo = prevMap[path];
      if (!fileInfo) return prevMap;

      // Create new map with updated file info
      return {
        ...prevMap,
        [path]: {
          ...fileInfo,
          included: false, // Always unselect when force excluding
          forceExcluded: !fileInfo.forceExcluded
        }
      };
    });

    // Find the normalized path for this file
    const fileInfo = managedFilesMap[path];
    if (!fileInfo) return;

    const normalizedPath = fileInfo.comparablePath || normalizePathForComparison(path);

    // Calculate the new included and excluded files based on the new state
    if (fileInfo.forceExcluded) {
      // If it was excluded, now we're un-excluding it
      const newExcludedFiles = currentExcludedFiles.filter(p =>
        normalizePathForComparison(p) !== normalizedPath
      );
      onUpdateExcludedFiles(newExcludedFiles);
    } else {
      // If it wasn't excluded, now we're excluding it
      // Also ensure it's removed from included files
      const newExcludedFiles = [...currentExcludedFiles, normalizedPath];
      onUpdateExcludedFiles(newExcludedFiles);

      // Remove from included
      const newIncludedFiles = currentIncludedFiles.filter(p =>
        normalizePathForComparison(p) !== normalizedPath
      );
      onUpdateIncludedFiles(newIncludedFiles);
    }
  }, [managedFilesMap, currentIncludedFiles, currentExcludedFiles, onUpdateIncludedFiles, onUpdateExcludedFiles, pushHistory]);

  const handleBulkToggle = useCallback((shouldInclude: boolean, targetFiles: FileInfo[]) => {
    // Save current state to history before making changes
    pushHistory(currentIncludedFiles, currentExcludedFiles);

    const operationSize = targetFiles.length;

    // Record this operation's time
    const now = Date.now();
    lastBulkOperationTimeRef.current = now;
    bulkOperationCountRef.current++;

    // Use deep cloned objects to avoid any reference issues
    const safeTargetFiles = JSON.parse(JSON.stringify(targetFiles)) as FileInfo[];

    // Process the file map update
    setManagedFilesMap(prevMap => {
      // Deep clone the previous map to ensure we don't have reference issues
      const newMap = JSON.parse(JSON.stringify(prevMap));
      let changedCount = 0;

      // Update each filtered file
      safeTargetFiles.forEach(file => {
        if (newMap[file.path]) {
          // Skip if already in the desired state for 'included' and 'forceExcluded' is compatible
          if (newMap[file.path].included === shouldInclude && (shouldInclude ? !newMap[file.path].forceExcluded : true)) {
            return;
          }

          newMap[file.path] = {
            ...newMap[file.path],
            included: shouldInclude,
            // If including, make sure not force excluded
            forceExcluded: shouldInclude ? false : newMap[file.path].forceExcluded
          };
          changedCount++;
        }
      });

      return newMap;
    });

    // Calculate the new included and excluded file sets based on the bulk operation
    const changedPaths = safeTargetFiles.map(file => {
      const path = file.path;
      const fileInfo = managedFilesMap[path];
      if (!fileInfo) return null;
      return fileInfo.comparablePath || normalizePathForComparison(path);
    }).filter(Boolean) as string[];

    if (shouldInclude) {
      // Adding files to included set
      const newIncludedFiles = [...new Set([...currentIncludedFiles, ...changedPaths])];
      onUpdateIncludedFiles(newIncludedFiles);

      // Remove from excluded if needed
      const newExcludedFiles = currentExcludedFiles.filter(path =>
        !changedPaths.includes(normalizePathForComparison(path))
      );
      if (newExcludedFiles.length !== currentExcludedFiles.length) {
        onUpdateExcludedFiles(newExcludedFiles);
      }
    } else {
      // Removing files from included set
      const newIncludedFiles = currentIncludedFiles.filter(path =>
        !changedPaths.includes(normalizePathForComparison(path))
      );
      onUpdateIncludedFiles(newIncludedFiles);
    }
  }, [managedFilesMap, currentIncludedFiles, currentExcludedFiles, onUpdateIncludedFiles, onUpdateExcludedFiles, pushHistory]);


  const normalizePaths = (paths: string[]): Set<string> => {
    return new Set(paths.map(path => {
      if (!path) return '';

      // Use a standardized normalization approach
      // This matches the normalizePathForComparison function but inline for efficiency
      let normalizedPath = path.trim();
      normalizedPath = normalizedPath.replace(/\\/g, '/');
      normalizedPath = normalizedPath.replace(/\/\/+/g, '/');

      // Remove leading ./ if present
      if (normalizedPath.startsWith('./')) {
        normalizedPath = normalizedPath.substring(2);
      }

      // Remove leading / if present (assuming paths are relative to project root)
      if (normalizedPath.startsWith('/')) {
        normalizedPath = normalizedPath.substring(1);
      }

      return normalizedPath;
    }).filter(Boolean)); // Filter out empty strings
  };

  const buildFilePathIndex = (filesMap: FilesMap): {
    byComparablePath: Map<string, string>,
    byFileName: Map<string, string[]>,
    byPath: Map<string, string>
  } => {
    const byComparablePath = new Map<string, string>();  // Map comparablePath -> actual path
    const byFileName = new Map<string, string[]>();      // Map filename -> array of paths
    const byPath = new Map<string, string>();            // Map actual path -> actual path (for direct lookup)

    for (const [path, fileInfo] of Object.entries(filesMap)) {
      // Store by comparable path (main lookup method)
      const comparablePath = fileInfo.comparablePath || path;
      byComparablePath.set(comparablePath, path);

      // Store by path directly
      byPath.set(path, path);

      // Store by filename for fallback lookup
      const fileName = path.split('/').pop() || '';
      if (fileName) {
        if (!byFileName.has(fileName)) {
          byFileName.set(fileName, []);
        }
        byFileName.get(fileName)?.push(path);
      }
    }

    return { byComparablePath, byFileName, byPath };
  };

  // Modern implementation for replacing selections with new paths (no compatibility options)
  const replaceAllSelectionsWithPaths = useCallback((newPaths: string[]) => {
    if (!newPaths || newPaths.length === 0) {
      return;
    }

    // This is now a dedicated function for replacing, never merging

    // Save current state to history before making changes
    pushHistory(currentIncludedFiles, currentExcludedFiles);

    const operationSize = newPaths.length;

    // Record this operation's time for rate limiting
    const now = Date.now();
    lastBulkOperationTimeRef.current = now;
    bulkOperationCountRef.current++;

    // Performance optimization: Build indices for faster lookups
    const fileIndices = buildFilePathIndex(managedFilesMap);

    // Matched paths will be collected here and used after UI update
    const matchedNormalizedPaths: string[] = [];
    const pathMatchingSet = new Set<string>(); // For tracking duplicates

    // Process the update in the UI
    setManagedFilesMap(prevMap => {
      // Create a mutable copy of the prevMap
      const updatedMap = { ...prevMap };
      const matchedPaths = new Set<string>(); // Track matched paths to avoid duplicates
      let includedCount = 0;

      // Normalize all paths in newPaths
      const normalizedPaths = normalizePaths(newPaths);

      // Reset all files to not included (except force excluded ones)
      for (const path of Object.keys(updatedMap)) {
        if (!updatedMap[path].forceExcluded) {
          updatedMap[path] = {
            ...updatedMap[path],
            included: false
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
              forceExcluded: false
            };
            includedCount++;
            found = true;
            matchedPaths.add(matchedPath);

            // Also add to our outer matched paths collection
            const normalizedMatchedPath = updatedMap[matchedPath].comparablePath || normalizedPath;
            if (!pathMatchingSet.has(normalizedMatchedPath)) {
              matchedNormalizedPaths.push(normalizedMatchedPath);
              pathMatchingSet.add(normalizedMatchedPath);
            }
          }
        }

        // 2. Path ends with the input path (common for relative paths)
        if (!found) {
          for (const [comparablePath, actualPath] of fileIndices.byComparablePath.entries()) {
            if (!matchedPaths.has(actualPath) &&
                normalizedPath &&
                comparablePath.endsWith('/' + normalizedPath)) {
              updatedMap[actualPath] = {
                ...updatedMap[actualPath],
                included: true,
                forceExcluded: false
              };
              includedCount++;
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
          const fileName = normalizedPath.split('/').pop() || '';
          if (fileName && fileIndices.byFileName.has(fileName)) {
            const candidates = fileIndices.byFileName.get(fileName) || [];

            // If we have a single match by filename, use it
            if (candidates.length === 1 && !matchedPaths.has(candidates[0])) {
              const actualPath = candidates[0];
              updatedMap[actualPath] = {
                ...updatedMap[actualPath],
                included: true,
                forceExcluded: false
              };
              includedCount++;
              found = true;
              matchedPaths.add(actualPath);

              // Also add to our outer matched paths collection
              const normalizedMatchedPath = updatedMap[actualPath].comparablePath || normalizedPath;
              if (!pathMatchingSet.has(normalizedMatchedPath)) {
                matchedNormalizedPaths.push(normalizedMatchedPath);
                pathMatchingSet.add(normalizedMatchedPath);
              }
            }
            // If multiple matches, try to find the best one by path similarity
            else if (candidates.length > 1) {
              // Find best match by comparing common path segments
              // E.g., if normalizedPath is "src/utils/helper.js", prefer matches with more path parts in common
              const pathParts = normalizedPath.split('/');
              let bestMatch = null;
              let bestMatchScore = 0;

              for (const candidatePath of candidates) {
                if (matchedPaths.has(candidatePath)) continue;

                const candidateParts = candidatePath.split('/');
                let matchScore = 0;

                // Count matching segments from the end (filename always matches)
                for (let i = 1; i <= Math.min(pathParts.length, candidateParts.length); i++) {
                  if (pathParts[pathParts.length - i] === candidateParts[candidateParts.length - i]) {
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
                  forceExcluded: false
                };
                includedCount++;
                found = true;
                matchedPaths.add(bestMatch);

                // Also add to our outer matched paths collection
                const normalizedMatchedPath = updatedMap[bestMatch].comparablePath || normalizedPath;
                if (!pathMatchingSet.has(normalizedMatchedPath)) {
                  matchedNormalizedPaths.push(normalizedMatchedPath);
                  pathMatchingSet.add(normalizedMatchedPath);
                }
              }
            }
          }
        }

        if (!found) {
          setExternalPathWarnings(prev => [...prev, `Path not found: ${normalizedPath}`]);
        }
      }

      return updatedMap;
    });

    // Instead of updating the session state in the render phase,
    // do it in the next microtask to avoid React errors about updating during render
    setTimeout(() => {
      // Always replace with exactly the matched paths
      onUpdateIncludedFiles(matchedNormalizedPaths);
    }, 0);
  }, [managedFilesMap, onUpdateIncludedFiles, pushHistory, currentIncludedFiles, currentExcludedFiles]);


  // Calculate derived state directly based on managedFilesMap
  const { includedPaths, excludedPaths } = useMemo(() => {
    const included = Object.values(managedFilesMap)
      .filter(f => f.included && !f.forceExcluded)
      .map(f => f.path);

    const excluded = Object.values(managedFilesMap)
      .filter(f => f.forceExcluded)
      .map(f => f.path);

    return { includedPaths: included, excludedPaths: excluded };
  }, [managedFilesMap]);

  // Track previous included paths length to detect when selection becomes empty
  const prevIncludedPathsLengthRef = useRef<number | undefined>();

  // Effect to auto-toggle "Show Only Selected" to "All Files" when selection becomes empty
  useEffect(() => {
    // Use the current prop value instead of derived state to be consistent with the source of truth
    const currentIncludedFilesLength = currentIncludedFiles.length;

    // Only act if "show only selected" is currently active
    // and there are files in the project (rawFilesMap indicates loaded project files)
    if (showOnlySelected && Object.keys(rawFilesMap).length > 0) {
      // Check if the count *became* zero (i.e., it was > 0 before and now is 0)
      if (currentIncludedFilesLength === 0 &&
          prevIncludedPathsLengthRef.current !== undefined &&
          prevIncludedPathsLengthRef.current > 0) {
        setShowOnlySelectedInternal(false);

        // Add user feedback through console for debugging
      }
    }

    // Better handling for the special case where a session with no selected files is loaded
    // but "Show Only Selected" is somehow still active - this can cause a confusing empty UI
    if (showOnlySelected &&
        currentIncludedFilesLength === 0 &&
        Object.keys(rawFilesMap).length > 0 &&
        !isTransitioningSession) {
      // Safety check: if we have files in rawFilesMap but no selections AND show only selected,
      // automatically switch to "All Files" view to prevent a confusing empty UI
      setShowOnlySelectedInternal(false);
    }

    // Update previous length for the next run
    prevIncludedPathsLengthRef.current = currentIncludedFilesLength;
  }, [currentIncludedFiles.length, showOnlySelected, setShowOnlySelectedInternal, rawFilesMap, isTransitioningSession]);

  // Simplified flush function - just a placeholder to maintain API compatibility
  const flushPendingOperations = useCallback(() => {}, []);

  // Implement undo selection function
  const undoSelection = useCallback(() => {
    if (pastSelections.length === 0) {
      return; // Nothing to undo
    }

    // Get a copy of the current state for redoing later
    const currentState = {
      included: [...currentIncludedFiles],
      excluded: [...currentExcludedFiles]
    };

    // Pop the last state from history
    const prevSelections = [...pastSelections];
    const prevState = prevSelections.pop();

    // Save current state to future for redo
    setFutureSelections(prev => [currentState, ...prev]);

    // Update history
    setPastSelections(prevSelections);

    // Apply the previous state
    if (prevState) {
      onUpdateIncludedFiles(prevState.included);
      onUpdateExcludedFiles(prevState.excluded);
    }
  }, [pastSelections, currentIncludedFiles, currentExcludedFiles, onUpdateIncludedFiles, onUpdateExcludedFiles]);

  // Implement redo selection function
  const redoSelection = useCallback(() => {
    if (futureSelections.length === 0) {
      return; // Nothing to redo
    }

    // Get a copy of the current state for undoing later
    const currentState = {
      included: [...currentIncludedFiles],
      excluded: [...currentExcludedFiles]
    };

    // Pop the next state from future
    const nextSelections = [...futureSelections];
    const nextState = nextSelections.shift();

    // Save current state to history for undo
    setPastSelections(prev => [...prev, currentState]);

    // Update future history
    setFutureSelections(nextSelections);

    // Apply the next state
    if (nextState) {
      onUpdateIncludedFiles(nextState.included);
      onUpdateExcludedFiles(nextState.excluded);
    }
  }, [futureSelections, currentIncludedFiles, currentExcludedFiles, onUpdateIncludedFiles, onUpdateExcludedFiles]);

  // Calculate if undo/redo are available
  const canUndo = pastSelections.length > 0;
  const canRedo = futureSelections.length > 0;

  return {
    managedFilesMap,
    searchTerm,
    showOnlySelected,
    externalPathWarnings,
    searchSelectedFilesOnly,
    includedPaths,
    excludedPaths,
    setSearchTerm,
    setShowOnlySelected,
    setExternalPathWarnings: clearExternalPathWarnings,
    toggleFileSelection,
    toggleFileExclusion,
    toggleSearchSelectedFilesOnly,
    handleBulkToggle,
    applySelectionsFromPaths,
    replaceAllSelectionsWithPaths,
    flushPendingOperations,
    undoSelection,
    redoSelection,
    canUndo,
    canRedo,
    reset
  };
}