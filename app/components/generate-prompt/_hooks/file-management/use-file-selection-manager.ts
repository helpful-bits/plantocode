"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { FileInfo } from "@/types";
import { mergeFileMaps, applySessionSelections } from "../../_utils/selection-merge";
import { FilesMap } from "./use-project-file-list";

interface UseFileSelectionManagerProps {
  rawFilesMap: FilesMap;
  sessionIncludedFiles?: string[];
  sessionExcludedFiles?: string[];
  onInteraction?: () => void;
}

/**
 * Hook to manage file selections, search state, and external path handling
 */
export function useFileSelectionManager({
  rawFilesMap,
  sessionIncludedFiles,
  sessionExcludedFiles,
  onInteraction
}: UseFileSelectionManagerProps) {
  // State
  const [managedFilesMap, setManagedFilesMap] = useState<FilesMap>({});
  const [searchTerm, setSearchTermInternal] = useState<string>("");
  const [showOnlySelected, setShowOnlySelectedInternal] = useState<boolean>(false);
  const [pastedPaths, setPastedPathsInternal] = useState<string>("");
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>([]);
  const [searchSelectedFilesOnly, setSearchSelectedFilesOnly] = useState<boolean>(false);

  // Effect to initialize/update managedFilesMap when rawFilesMap changes
  useEffect(() => {
    if (Object.keys(rawFilesMap).length > 0) {
      console.log(`[FileSelectionManager] Raw files map updated with ${Object.keys(rawFilesMap).length} files, merging with current state...`);
      
      setManagedFilesMap(currentMap => {
        // If we don't have an existing state with selections, just use the raw file map
        if (Object.keys(currentMap).length === 0) {
          return rawFilesMap;
        }
        
        // Otherwise merge to preserve selections
        const updatedMap = mergeFileMaps(currentMap, rawFilesMap);
        console.log(`[FileSelectionManager] Merged file maps, preserved selections for ${Object.keys(updatedMap).length} files`);
        return updatedMap;
      });
    }
  }, [rawFilesMap]);

  // Effect to apply session selections when either map or session data changes
  useEffect(() => {
    // Only proceed if we have files and session data
    if (
      Object.keys(managedFilesMap).length === 0 ||
      (!sessionIncludedFiles?.length && !sessionExcludedFiles?.length)
    ) {
      return;
    }

    console.log(
      `[FileSelectionManager] Applying session selections: ${
        sessionIncludedFiles?.length || 0
      } included, ${sessionExcludedFiles?.length || 0} excluded`
    );

    setManagedFilesMap((currentMap) => {
      const updatedMap = applySessionSelections(
        currentMap,
        sessionIncludedFiles,
        sessionExcludedFiles
      );

      // Perform a shallow equality check on the inclusion / exclusion flags
      let hasDifference = false;
      for (const path of Object.keys(updatedMap)) {
        const prev = currentMap[path];
        const next = updatedMap[path];
        if (
          !prev ||
          prev.included !== next.included ||
          prev.forceExcluded !== next.forceExcluded
        ) {
          hasDifference = true;
          break;
        }
      }

      // Only update state if something actually changed to avoid unnecessary re-renders
      return hasDifference ? updatedMap : currentMap;
    });
    // We purposely omit managedFilesMap from dependencies to avoid an infinite loop.
    // The shallow equality check above makes sure state is only updated when necessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIncludedFiles, sessionExcludedFiles]);

  // Wrapper handlers that call onInteraction
  const setSearchTerm = useCallback((value: string) => {
    setSearchTermInternal(value);
    if (onInteraction) onInteraction();
  }, [onInteraction]);

  const setShowOnlySelected = useCallback((value: boolean) => {
    setShowOnlySelectedInternal(value);
    if (onInteraction) onInteraction();
  }, [onInteraction]);

  const setPastedPaths = useCallback((value: string) => {
    setPastedPathsInternal(value);
    if (onInteraction) onInteraction();
  }, [onInteraction]);

  const toggleSearchSelectedFilesOnly = useCallback((value?: boolean) => {
    // If the value is explicitly provided, use it
    // Otherwise toggle the current value
    if (typeof value === 'boolean') {
      setSearchSelectedFilesOnly(value);
    } else {
      setSearchSelectedFilesOnly(prev => !prev);
    }
    
    if (onInteraction) onInteraction();
  }, [onInteraction]); // searchSelectedFilesOnly is intentionally omitted from dependencies

  // File selection handlers
  const toggleFileSelection = useCallback((path: string) => {
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
    
    if (onInteraction) onInteraction();
  }, [onInteraction]);

  const toggleFileExclusion = useCallback((path: string) => {
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
    
    if (onInteraction) onInteraction();
  }, [onInteraction]);

  const handleBulkToggle = useCallback((shouldInclude: boolean, targetFiles: FileInfo[]) => {
    setManagedFilesMap(prevMap => {
      const newMap = { ...prevMap };
      let changedCount = 0;
      
      // Update each filtered file
      targetFiles.forEach(file => {
        if (newMap[file.path]) {
          // Skip if already in the desired state
          if (newMap[file.path].included === shouldInclude) return;
          
          newMap[file.path] = {
            ...newMap[file.path],
            included: shouldInclude,
            // If including, make sure not force excluded
            forceExcluded: shouldInclude ? false : newMap[file.path].forceExcluded
          };
          changedCount++;
        }
      });
      
      console.log(`[FileSelectionManager] Bulk ${shouldInclude ? 'selected' : 'deselected'} ${changedCount} files`);
      return newMap;
    });
    
    if (onInteraction) onInteraction();
  }, [onInteraction]);

  const applySelectionsFromPaths = useCallback((paths: string[]) => {
    if (!paths || paths.length === 0) return;
    
    console.log(`[FileSelectionManager] Applying selections from ${paths.length} external paths`);
    
    // Update the file map to mark these paths as included
    setManagedFilesMap(prevMap => {
      const updatedMap = { ...prevMap };
      const warnings: string[] = [];
      let includedCount = 0;
      
      // Mark each path as included
      paths.forEach((path: string) => {
        if (updatedMap[path]) {
          updatedMap[path] = {
            ...updatedMap[path],
            included: true,
            forceExcluded: false
          };
          includedCount++;
        } else {
          warnings.push(`Path not found: ${path}`);
        }
      });
      
      if (warnings.length > 0) {
        console.warn(`[FileSelectionManager] ${warnings.length} paths not found in the current file map`);
        setExternalPathWarnings(warnings);
      }
      
      console.log(`[FileSelectionManager] Applied selections to ${includedCount} paths`);
      
      // Update the pastedPaths field with the new paths
      setPastedPathsInternal(paths.join('\n'));
      
      return updatedMap;
    });
    
    if (onInteraction) onInteraction();
  }, [onInteraction]);

  // Calculate derived state
  const { includedPaths, excludedPaths } = useMemo(() => {
    const included = Object.values(managedFilesMap)
      .filter(f => f.included && !f.forceExcluded)
      .map(f => f.path);
    
    const excluded = Object.values(managedFilesMap)
      .filter(f => f.forceExcluded)
      .map(f => f.path);
    
    return { includedPaths: included, excludedPaths: excluded };
  }, [managedFilesMap]);

  return {
    // State
    managedFilesMap,
    searchTerm,
    showOnlySelected,
    pastedPaths,
    externalPathWarnings,
    searchSelectedFilesOnly,
    includedPaths,
    excludedPaths,
    
    // Setters
    setSearchTerm,
    setShowOnlySelected,
    setPastedPaths,
    setExternalPathWarnings,
    
    // Toggles
    toggleFileSelection,
    toggleFileExclusion,
    toggleSearchSelectedFilesOnly,
    
    // Actions
    handleBulkToggle,
    applySelectionsFromPaths
  };
}