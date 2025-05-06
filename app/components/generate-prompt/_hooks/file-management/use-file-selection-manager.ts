"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { FileInfo } from "@/types";
import { mergeFileMaps, applySessionSelections } from "../../_utils/selection-merge";
import { FilesMap } from "./use-project-file-list";
import { normalizePathForComparison } from "@/lib/path-utils";

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
  
  // Function to clear external path warnings
  const clearExternalPathWarnings = useCallback(() => {
    if (externalPathWarnings.length > 0) {
      console.log('[FileSelectionManager] Clearing external path warnings');
      setExternalPathWarnings([]);
    }
  }, [externalPathWarnings]);

  // Combined effect to initialize/update managedFilesMap when rawFilesMap or session selections change
  useEffect(() => {
    // Skip if there are no files to process
    if (Object.keys(rawFilesMap).length === 0) {
      return;
    }

    console.log(`[FileSelectionManager] Files or selections changed: ${Object.keys(rawFilesMap).length} files, ${
      sessionIncludedFiles?.length || 0
    } included, ${sessionExcludedFiles?.length || 0} excluded`);

    setManagedFilesMap(currentMap => {
      // Step 1: Create a pristine initial map based on rawFilesMap
      // Start with a fresh map instead of merging with current to ensure proper restoration
      const baseMap = { ...rawFilesMap };
      
      // Step 2: Apply session selections to this pristine map if they exist
      let resultMap = baseMap;
      
      if (sessionIncludedFiles?.length || sessionExcludedFiles?.length) {
        console.log(
          `[FileSelectionManager] Applying session selections to pristine map: ${
            sessionIncludedFiles?.length || 0
          } included, ${sessionExcludedFiles?.length || 0} excluded`
        );
        
        // Apply session selections to the pristine map
        resultMap = applySessionSelections(
          baseMap,
          sessionIncludedFiles,
          sessionExcludedFiles
        );
      } else if (Object.keys(currentMap).length > 0) {
        // If no session data but we have an existing map with selections,
        // try to preserve those selections by merging
        resultMap = mergeFileMaps(currentMap, baseMap);
        console.log(`[FileSelectionManager] No session selections, preserving current selections for ${Object.keys(resultMap).length} files`);
      }
      
      // Step 3: Perform a semantic equality check
      let hasDifference = false;
      
      // First check if the maps have the same files
      if (Object.keys(currentMap).length !== Object.keys(resultMap).length) {
        hasDifference = true;
      } else {
        // Then check if any file has different selection state
        for (const path of Object.keys(resultMap)) {
          const prev = currentMap[path];
          const next = resultMap[path];
          if (
            !prev ||
            prev.included !== next.included ||
            prev.forceExcluded !== next.forceExcluded
          ) {
            hasDifference = true;
            break;
          }
        }
      }

      // Only update state if something actually changed to avoid unnecessary re-renders
      if (hasDifference) {
        console.log(`[FileSelectionManager] File map has changed, updating state`);
        return resultMap;
      } else {
        console.log(`[FileSelectionManager] No changes detected in file map, keeping current state`);
        return currentMap;
      }
    });
  }, [rawFilesMap, sessionIncludedFiles, sessionExcludedFiles]);

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
    // Clear any existing warnings when paths are updated
    if (externalPathWarnings.length > 0) {
      console.log('[FileSelectionManager] Clearing external path warnings due to path update');
      setExternalPathWarnings([]);
    }
    if (onInteraction) onInteraction();
  }, [onInteraction, externalPathWarnings]);

  // Simplified toggle function to avoid comparison issues
  const toggleSearchSelectedFilesOnly = useCallback((value?: boolean) => {
    if (typeof value === 'boolean') {
      // Directly set to the specified value
      setSearchSelectedFilesOnly(value);
    } else {
      // Toggle current value
      setSearchSelectedFilesOnly(prev => !prev);
    }
    
    // Call interaction handler regardless
    if (onInteraction) onInteraction();
  }, [onInteraction]); // Remove searchSelectedFilesOnly from deps to avoid recreating function

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
    if (!paths || paths.length === 0) {
      console.log(`[FileSelectionManager] No paths provided to applySelectionsFromPaths`);
      return;
    }
    
    console.log(`[FileSelectionManager] Applying selections from ${paths.length} external paths`);
    if (paths.length > 0) {
      console.log(`[FileSelectionManager] Sample paths: ${paths.slice(0, 3).join(', ')}${paths.length > 3 ? '...' : ''}`);
    }
    
    // Update the file map to mark these paths as included
    setManagedFilesMap(prevMap => {
      const updatedMap = { ...prevMap };
      const warnings: string[] = [];
      let includedCount = 0;
      
      console.log(`[FileSelectionManager] Current file map has ${Object.keys(prevMap).length} entries`);
      
      // Debug: Print first few entries from the file map to see structure
      const samplePaths = Object.keys(prevMap).slice(0, 3);
      console.log("[FileSelectionManager] Sample file map entries:", samplePaths);
      
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
          includedCount++;
        } else {
          // Try to find a matching file using the comparablePath property
          let found = false;
          
          console.log(`[FileSelectionManager] Looking for match for: ${path} (normalized: ${normalizedInputPath})`);
          
          // First try: Direct match using comparablePath
          for (const mapPath of Object.keys(updatedMap)) {
            const fileInfo = updatedMap[mapPath];
            
            if (fileInfo.comparablePath === normalizedInputPath) {
              console.log(`[FileSelectionManager] Found exact comparablePath match: ${mapPath}`);
              updatedMap[mapPath] = {
                ...updatedMap[mapPath],
                included: true,
                forceExcluded: false
              };
              includedCount++;
              found = true;
              break;
            }
          }
          
          // Second try: Path ends with the input path (handles project-relative paths)
          if (!found) {
            for (const mapPath of Object.keys(updatedMap)) {
              const fileInfo = updatedMap[mapPath];
              
              if (normalizedInputPath && fileInfo.comparablePath.endsWith('/' + normalizedInputPath)) {
                console.log(`[FileSelectionManager] Found path ending match: ${mapPath} for ${path}`);
                updatedMap[mapPath] = {
                  ...updatedMap[mapPath],
                  included: true,
                  forceExcluded: false
                };
                includedCount++;
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
                console.log(`[FileSelectionManager] Found input-contains-mappath match: ${mapPath} for ${path}`);
                updatedMap[mapPath] = {
                  ...updatedMap[mapPath],
                  included: true,
                  forceExcluded: false
                };
                includedCount++;
                found = true;
                break;
              }
            }
          }
          
          if (!found) {
            console.warn(`[FileSelectionManager] Path not found in file map: ${path}`);
            warnings.push(`Path not found: ${path}`);
          }
        }
      });
      
      if (warnings.length > 0) {
        console.warn(`[FileSelectionManager] ${warnings.length} paths not found in the current file map`);
        setExternalPathWarnings(warnings);
      }
      
      console.log(`[FileSelectionManager] Applied selections to ${includedCount} of ${paths.length} paths`);
      
      // Removed setPastedPathsInternal call to prevent maximum update depth exceeded error
      // The PastePaths component already calls setPastedPaths, which triggers this function
      
      return updatedMap;
    });
    
    if (onInteraction) onInteraction();
  }, [onInteraction]);

  const replaceAllSelectionsWithPaths = useCallback((newPaths: string[]) => {
    if (!newPaths || newPaths.length === 0) {
      return;
    }
    
    setManagedFilesMap(prevMap => {
      // Create a mutable copy of the prevMap
      const updatedMap = { ...prevMap };
      const warnings: string[] = [];
      let includedCount = 0;
      
      // Normalize all paths in newPaths and store them in a Set for quick lookup
      const normalizedPaths = new Set(newPaths.map(path => normalizePathForComparison(path)));
      
      // First, set all files to not included (except force excluded ones)
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
        
        // First try: Direct match using comparablePath
        for (const mapPath of Object.keys(updatedMap)) {
          const fileInfo = updatedMap[mapPath];
          
          if (fileInfo.comparablePath === normalizedPath) {
            updatedMap[mapPath] = {
              ...updatedMap[mapPath],
              included: true,
              forceExcluded: false
            };
            includedCount++;
            found = true;
            break;
          }
        }
        
        // Second try: Path ends with the input path (handles project-relative paths)
        if (!found) {
          for (const mapPath of Object.keys(updatedMap)) {
            const fileInfo = updatedMap[mapPath];
            
            if (normalizedPath && fileInfo.comparablePath.endsWith('/' + normalizedPath)) {
              updatedMap[mapPath] = {
                ...updatedMap[mapPath],
                included: true,
                forceExcluded: false
              };
              includedCount++;
              found = true;
              break;
            }
          }
        }
        
        // Third try: Input path contains the map path (for scenarios where the full absolute path is pasted)
        if (!found) {
          for (const mapPath of Object.keys(updatedMap)) {
            const fileInfo = updatedMap[mapPath];
            
            if (normalizedPath.includes(fileInfo.comparablePath)) {
              updatedMap[mapPath] = {
                ...updatedMap[mapPath],
                included: true,
                forceExcluded: false
              };
              includedCount++;
              found = true;
              break;
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
    applySelectionsFromPaths,
    replaceAllSelectionsWithPaths
  };
}