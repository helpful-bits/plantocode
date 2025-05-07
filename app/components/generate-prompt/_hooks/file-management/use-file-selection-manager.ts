"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { FileInfo } from "@/types";
import { mergeFileMaps, applySessionSelections } from "../../_utils/selection-merge";
import { FilesMap } from "./use-project-file-list";
import { makePathRelative } from "@/lib/path-utils";
import debounce from '@/lib/utils/debounce';

interface UseFileSelectionManagerProps {
  rawFilesMap: FilesMap;
  sessionIncludedFiles?: string[];
  sessionExcludedFiles?: string[];
  initialSearchSelectedFilesOnly?: boolean;
  initialSearchTerm?: string;
  onInteraction?: () => void;
  isSwitchingSession?: boolean;
}

/**
 * Hook to manage file selections, search state, and external path handling
 */
export function useFileSelectionManager({
  rawFilesMap,
  sessionIncludedFiles,
  sessionExcludedFiles,
  initialSearchSelectedFilesOnly,
  initialSearchTerm,
  onInteraction,
  isSwitchingSession = false
}: UseFileSelectionManagerProps) {
  // State
  const [managedFilesMap, setManagedFilesMap] = useState<FilesMap>({});
  const [searchTerm, setSearchTermInternal] = useState<string>(initialSearchTerm || "");
  const [showOnlySelected, setShowOnlySelectedInternal] = useState<boolean>(false);
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>([]);
  const [searchSelectedFilesOnly, setSearchSelectedFilesOnly] = useState<boolean>(initialSearchSelectedFilesOnly ?? false);
  
  // Keep track of the last seen session selections to handle session switching properly
  const lastSessionSelectionsRef = useRef<{
    includedFiles?: string[];
    excludedFiles?: string[];
  }>({});
  
  // Update the saved selections whenever they change
  useEffect(() => {
    if (sessionIncludedFiles !== undefined || sessionExcludedFiles !== undefined) {
      lastSessionSelectionsRef.current = {
        includedFiles: sessionIncludedFiles,
        excludedFiles: sessionExcludedFiles
      };
    }
  }, [sessionIncludedFiles, sessionExcludedFiles]);
  
  // Track the previous switching state
  const prevIsSwitchingRef = useRef(isSwitchingSession);
  
  // Effect to update searchTerm state when initialSearchTerm changes or when explicitly switching sessions
  useEffect(() => {
    // This effect ensures that if initialSearchTerm prop changes (e.g. new session) 
    // or if a session switch is explicitly flagged, the local searchTerm is reset.
    // It does NOT run on every render, only when these specific dependencies change.
    if (initialSearchTerm !== undefined || isSwitchingSession) {
      console.log(`[FileSelectionManager] Updating searchTerm from initialSearchTerm: "${initialSearchTerm}" (switching: ${isSwitchingSession})`);
      setSearchTermInternal(initialSearchTerm || "");
    }
  }, [initialSearchTerm, isSwitchingSession]);
  
  // Define applySelectionsFromPaths function
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
      
      
      return updatedMap;
    });
    
    if (onInteraction) onInteraction();
  }, [onInteraction]);

  // Only track session switching state change
  useEffect(() => {
    // If we just finished switching sessions, log for debugging
    if (prevIsSwitchingRef.current && !isSwitchingSession) {
      console.log('[FileSelectionManager] Session switching completed.');
    }
    
    prevIsSwitchingRef.current = isSwitchingSession;
  }, [isSwitchingSession]);
  
  // Function to clear external path warnings
  const clearExternalPathWarnings = useCallback(() => {
    if (externalPathWarnings.length > 0) {
      console.log('[FileSelectionManager] Clearing external path warnings');
      setExternalPathWarnings([]);
    }
  }, [externalPathWarnings]);

  // Combined effect to initialize/update managedFilesMap when rawFilesMap or session selections change
  useEffect(() => {
    // If session is switching, defer processing to avoid unnecessary work during transition
    // But make sure we capture the session selection arrays for use when switching is complete
    if (isSwitchingSession) {
      console.log('[FileSelectionManager] Session is switching, deferring selection update.');
      
      // Store the sessions in case we need them later
      if (sessionIncludedFiles !== undefined || sessionExcludedFiles !== undefined) {
        console.log('[FileSelectionManager] Storing session selections during switching');
      }
      return;
    }

    // If rawFilesMap is empty, it might mean files are still loading for the project.
    // In this case, we should clear or reset managedFilesMap.
    if (Object.keys(rawFilesMap).length === 0) {
      setManagedFilesMap(prevMap => {
        if (Object.keys(prevMap).length > 0) {
          console.log('[FileSelectionManager] rawFilesMap is empty, resetting managedFilesMap.');
          return {}; // Reset to empty if it wasn't already
        }
        return prevMap; // No change if already empty
      });
      return;
    }

    // Always start with a fresh, deep-cloned map of all project files from rawFilesMap.
    // This ensures all files are present with their default selection states (usually unselected).
    const newBaseMap = JSON.parse(JSON.stringify(rawFilesMap));

    setManagedFilesMap(currentInternalMap => {
      let resultMap;

      // TWO SCENARIOS:
      // 1. Session change - we have session file selections (includedFiles/excludedFiles) - always use these
      // 2. Refresh files - we want to preserve existing selections from currentInternalMap

      if (sessionIncludedFiles !== undefined || sessionExcludedFiles !== undefined) {
        // Scenario 1: Session change - apply session selections
        console.log(`[FileSelectionManager] Applying session selections: Included: ${sessionIncludedFiles?.length || 0}, Excluded: ${sessionExcludedFiles?.length || 0}`);
        console.log(`[FileSelectionManager] Using branch 1: Applying session selections`);
        
        resultMap = applySessionSelections(
          newBaseMap,
          sessionIncludedFiles || [],
          sessionExcludedFiles || []
        );
      } else if (Object.keys(currentInternalMap).length > 0) {
        // Scenario 2: Refreshing files - we want to preserve existing user selections
        console.log(`[FileSelectionManager] Preserving selections after file refresh for ${Object.keys(currentInternalMap).length} files`);
        console.log(`[FileSelectionManager] Using branch 2: Preserving existing selections`);
        
        // Merge the current selections into the new file map
        resultMap = mergeFileMaps(currentInternalMap, newBaseMap);
      } else {
        // First load with no session data
        console.log(`[FileSelectionManager] First load with no session data, using default selection states`);
        console.log(`[FileSelectionManager] Using branch 3: First load with no session data`);
        resultMap = newBaseMap;
      }

      // Perform a semantic equality check to see if the map content has actually changed.
      // This avoids unnecessary re-renders if the effective selections remain the same.
      let hasDifference = false;
      if (Object.keys(currentInternalMap).length !== Object.keys(resultMap).length) {
        hasDifference = true;
      } else {
        for (const path of Object.keys(resultMap)) {
          const prev = currentInternalMap[path];
          const next = resultMap[path];
          if (!prev || prev.included !== next.included || prev.forceExcluded !== next.forceExcluded) {
            hasDifference = true;
            break;
          }
        }
      }

      if (hasDifference) {
        return resultMap;
      }
      // No effective change in content, skip update
      return currentInternalMap;
    });
  }, [rawFilesMap, sessionIncludedFiles, sessionExcludedFiles, isSwitchingSession]);

  // Create a debounced version of onInteraction for input field changes
  const debouncedInteraction = useMemo(
    () => debounce(() => {
      if (onInteraction) {
        console.log('[FileSelectionManager] Triggering debounced interaction for file selection changes');
        onInteraction();
      }
    }, 750), // 750ms debounce for input changes
    [onInteraction]
  );

  // Wrapper handlers that call onInteraction with debouncing
  const setSearchTerm = useCallback((value: string) => {
    setSearchTermInternal(value);
    debouncedInteraction();
  }, [debouncedInteraction]);

  const setShowOnlySelected = useCallback((value: boolean) => {
    setShowOnlySelectedInternal(value);
    debouncedInteraction();
  }, [debouncedInteraction]);


  // Simplified toggle function to avoid comparison issues, with debounced interaction
  const toggleSearchSelectedFilesOnly = useCallback((value?: boolean) => {
    if (typeof value === 'boolean') {
      // Directly set to the specified value
      setSearchSelectedFilesOnly(value);
    } else {
      // Toggle current value
      setSearchSelectedFilesOnly(prev => !prev);
    }
    
    // Call debounced interaction handler
    debouncedInteraction();
  }, [debouncedInteraction]); 

  // Create a more aggressive debounce for rapid checkbox selections
  const debouncedBulkInteraction = useMemo(
    () => debounce(() => {
      if (onInteraction) {
        console.log('[FileSelectionManager] Triggering debounced bulk interaction for file selections');
        onInteraction();
      }
    }, 750), // 750ms debounce for checkbox operations which tend to happen in bursts
    [onInteraction]
  );
  
  // Track pending bulk operations
  const bulkOperationCountRef = useRef(0);
  const lastBulkOperationTimeRef = useRef(0);

  // Track consecutive individual toggles for improved batching
  const toggleCountRef = useRef(0);
  const lastToggleTimeRef = useRef(0);
  
  // File selection handlers with improved debouncing
  const toggleFileSelection = useCallback((path: string) => {
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
    
    // If we detect rapid toggles that could lead to rate limiting, use more aggressive debouncing
    if (toggleCountRef.current >= 5) {
      console.log(`[FileSelectionManager] Detected rapid toggles (${toggleCountRef.current}), using more aggressive debouncing`);
      debouncedBulkInteraction.cancel(); // Cancel any pending interactions
    }
    
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
    
    // Use standard debounce for single toggles, or bulk debounce for rapid sequences
    if (toggleCountRef.current >= 5) {
      debouncedBulkInteraction();
    } else {
      debouncedInteraction();
    }
  }, [debouncedInteraction, debouncedBulkInteraction]);

  const toggleFileExclusion = useCallback((path: string) => {
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
    
    // If we detect rapid toggles that could lead to rate limiting, use more aggressive debouncing
    if (toggleCountRef.current >= 5) {
      console.log(`[FileSelectionManager] Detected rapid toggles (${toggleCountRef.current}), using more aggressive debouncing`);
      debouncedBulkInteraction.cancel(); // Cancel any pending interactions
    }
    
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
    
    // Use standard debounce for single toggles, or bulk debounce for rapid sequences
    if (toggleCountRef.current >= 5) {
      debouncedBulkInteraction();
    } else {
      debouncedInteraction();
    }
  }, [debouncedInteraction, debouncedBulkInteraction]);

  const handleBulkToggle = useCallback((shouldInclude: boolean, targetFiles: FileInfo[]) => {
    const operationSize = targetFiles.length;
    console.log(`[FileSelectionManager] Bulk toggle: ${shouldInclude ? 'selecting' : 'deselecting'} ${operationSize} files`);
    
    // For large operations, implement rate limiting protection
    const now = Date.now();
    const timeSinceLastOperation = now - lastBulkOperationTimeRef.current;
    
    // If we're attempting another large operation within 5 seconds of the last one, use debounce instead
    if (operationSize > 50 && timeSinceLastOperation < 5000) {
      console.log(`[FileSelectionManager] Debouncing large bulk operation (${operationSize} files) - too soon after previous operation`);
      bulkOperationCountRef.current++;
      
      // Queue the operation through our aggressive debouncer
      debouncedBulkInteraction.cancel(); // Cancel any pending operations
      
      // Use deep cloned objects to avoid any reference issues
      const safeTargetFiles = JSON.parse(JSON.stringify(targetFiles)) as FileInfo[];
      
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
        
        console.log(`[FileSelectionManager] Changed ${changedCount} files in bulk toggle (debounced)`);
        return newMap;
      });
      
      // Use the aggressive debounce for this bulk operation
      debouncedBulkInteraction();
      return;
    }
    
    // Record this operation's time
    lastBulkOperationTimeRef.current = now;
    bulkOperationCountRef.current++;
    
    // Use deep cloned objects to avoid any reference issues
    const safeTargetFiles = JSON.parse(JSON.stringify(targetFiles)) as FileInfo[];
    
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
      
      console.log(`[FileSelectionManager] Changed ${changedCount} files in bulk toggle`);
      return newMap;
    });
    
    // Use a fixed 750ms delay for all bulk operations as specified
    const delay = 750; // Fixed 750ms delay for all bulk operations
    
    console.log(`[FileSelectionManager] Delaying interaction after bulk toggle (${delay}ms for ${operationSize} files)`);
    
    // Use timeout instead of direct call to allow React to finish state updates first
    // Also provides explicit throttling for large operations
    setTimeout(() => {
      console.log(`[FileSelectionManager] Triggering interaction after bulk toggle`);
      // Decrement pending operations counter
      bulkOperationCountRef.current = Math.max(0, bulkOperationCountRef.current - 1);
      
      // For bulk operations, directly call onInteraction - we already have throttling
      if (onInteraction && bulkOperationCountRef.current === 0) {
        onInteraction();
      } else {
        console.log(`[FileSelectionManager] Skipping interaction callback - ${bulkOperationCountRef.current} operations still pending`);
      }
    }, delay);
  }, [onInteraction, debouncedBulkInteraction]);


  const replaceAllSelectionsWithPaths = useCallback((newPaths: string[]) => {
    if (!newPaths || newPaths.length === 0) {
      return;
    }
    
    const operationSize = newPaths.length;
    console.log(`[FileSelectionManager] Replace selections with ${operationSize} paths`);
    
    // For large operations, implement rate limiting protection
    const now = Date.now();
    const timeSinceLastOperation = now - lastBulkOperationTimeRef.current;
    
    // If we're attempting another large operation within 5 seconds of the last one, use debounce instead
    if (operationSize > 50 && timeSinceLastOperation < 5000) {
      console.log(`[FileSelectionManager] Debouncing large path replacement operation (${operationSize} paths) - too soon after previous operation`);
      bulkOperationCountRef.current++;
      
      // Queue the operation through our aggressive debouncer
      debouncedBulkInteraction.cancel(); // Cancel any pending operations
      
      setManagedFilesMap(prevMap => {
        // Create a mutable copy of the prevMap
        const updatedMap = { ...prevMap };
        const warnings: string[] = [];
        let includedCount = 0;
        
        // Normalize all paths in newPaths
        const normalizedPaths = new Set(newPaths.map(path => {
          // Use normalizePathForComparison directly rather than as a dependency
          if (!path) return '';
          
          let normalizedPath = path;
          
          // Trim whitespace
          normalizedPath = normalizedPath.trim();
          
          // Convert backslashes to forward slashes
          normalizedPath = normalizedPath.replace(/\\/g, '/');
          
          // Replace multiple consecutive slashes with a single one
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
        }));
        
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
        
        console.log(`[FileSelectionManager] Applied ${includedCount} of ${operationSize} paths (debounced)`);
        return updatedMap;
      });
      
      // Use the aggressive debounce for this bulk operation
      debouncedBulkInteraction();
      return;
    }
    
    // Record this operation's time
    lastBulkOperationTimeRef.current = now;
    bulkOperationCountRef.current++;
    
    setManagedFilesMap(prevMap => {
      // Create a mutable copy of the prevMap
      const updatedMap = { ...prevMap };
      const warnings: string[] = [];
      let includedCount = 0;
      
      // Normalize all paths in newPaths
      const normalizedPaths = new Set(newPaths.map(path => {
        // Use normalizePathForComparison directly rather than as a dependency
        if (!path) return '';
        
        let normalizedPath = path;
        
        // Trim whitespace
        normalizedPath = normalizedPath.trim();
        
        // Convert backslashes to forward slashes
        normalizedPath = normalizedPath.replace(/\\/g, '/');
        
        // Replace multiple consecutive slashes with a single one
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
      }));
      
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
      
      console.log(`[FileSelectionManager] Applied ${includedCount} of ${operationSize} paths`);
      return updatedMap;
    });
    
    // Use a fixed 750ms delay for all bulk operations as specified
    const delay = 750; // Fixed 750ms delay for all bulk operations
    
    console.log(`[FileSelectionManager] Delaying interaction after replacing paths (${delay}ms for ${operationSize} paths)`);
    
    setTimeout(() => {
      console.log(`[FileSelectionManager] Triggering interaction after replacing selections with paths`);
      // Decrement pending operations counter
      bulkOperationCountRef.current = Math.max(0, bulkOperationCountRef.current - 1);
      
      // For bulk operations, directly call onInteraction - we already have throttling
      if (onInteraction && bulkOperationCountRef.current === 0) {
        onInteraction();
      } else {
        console.log(`[FileSelectionManager] Skipping interaction callback - ${bulkOperationCountRef.current} operations still pending`);
      }
    }, delay);
  }, [onInteraction, debouncedBulkInteraction]);


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

  // Create a function to force flush all pending debounced operations
  const flushPendingOperations = useCallback(() => {
    // Flush any pending debounced operations
    if (debouncedInteraction) {
      console.log('[FileSelectionManager] Flushing pending standard debounced operations');
      debouncedInteraction.flush();
    }
    
    if (debouncedBulkInteraction) {
      console.log('[FileSelectionManager] Flushing pending bulk debounced operations');
      debouncedBulkInteraction.flush();
    }
  }, [debouncedInteraction, debouncedBulkInteraction]);
  
  // Effect to ensure selections are flushed when component unmounts or when session switches
  useEffect(() => {
    // Return cleanup function
    return () => {
      // Before unmounting, flush all pending operations
      flushPendingOperations();
    };
  }, [flushPendingOperations]);
  
  // Also flush pending operations when explicitly switching sessions
  useEffect(() => {
    if (isSwitchingSession) {
      console.log('[FileSelectionManager] Session switching detected, flushing pending operations');
      flushPendingOperations();
    }
  }, [isSwitchingSession, flushPendingOperations]);
  
  return {
    // State
    managedFilesMap,
    searchTerm,
    showOnlySelected,
    externalPathWarnings,
    searchSelectedFilesOnly,
    includedPaths,
    excludedPaths,
    
    // Setters
    setSearchTerm,
    setShowOnlySelected,
    setExternalPathWarnings,
    
    // Toggles
    toggleFileSelection,
    toggleFileExclusion,
    toggleSearchSelectedFilesOnly,
    
    // Actions
    handleBulkToggle,
    applySelectionsFromPaths,
    replaceAllSelectionsWithPaths,
    flushPendingOperations
  };
}