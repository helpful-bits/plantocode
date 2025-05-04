"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { shouldIncludeByDefault } from "../_utils/file-selection";
import { findRelevantFilesAction } from "@/actions/path-finder/index";
import { useNotification } from '@/lib/contexts/notification-context';
import { sessionSyncService } from '@/lib/services/session-sync-service';
import { trackSelectionChanges } from "../_utils/debug";
import { normalizePath } from "@/lib/path-utils";
import { readDirectoryAction, invalidateDirectoryCache } from "@/actions/read-directory-actions";
import { invalidateFileCache } from '@/lib/git-utils';
import { mergeFileMaps, applySessionSelections } from "../_utils/selection-merge";
import { useBackgroundJob } from '@/lib/contexts/background-jobs-context';
import debounce from '@/lib/utils/debounce';

// Types
export interface FileInfo {
  path: string;
  size?: number;
  included: boolean;
  forceExcluded: boolean;
}

export type FilesMap = { [path: string]: FileInfo };

// Constant for minimum time between file loads to prevent spam
const MIN_LOAD_INTERVAL = 60000; // 1 minute

interface UseFileSelectionStateProps {
  projectDirectory: string | null;
  activeSessionId: string | null;
  taskDescription: string;
  onInteraction?: () => void;
  setHasUnsavedChanges?: (value: boolean) => void;
  debugMode?: boolean;
}

export function useFileSelectionState({
  projectDirectory,
  activeSessionId,
  taskDescription,
  onInteraction,
  setHasUnsavedChanges,
  debugMode = false
}: UseFileSelectionStateProps) {
  // State
  const [allFilesMap, setAllFilesMap] = useState<FilesMap>({});
  const [fileContentsMap, setFileContentsMap] = useState<{ [key: string]: string }>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [pastedPaths, setPastedPaths] = useState("");
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>([]);
  const [searchSelectedFilesOnly, setSearchSelectedFilesOnly] = useState<boolean>(false);
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [isFindingFiles, setIsFindingFiles] = useState(false);
  const [findingFilesJobId, setFindingFilesJobId] = useState<string | null>(null);
  const [pathDebugInfo, setPathDebugInfo] = useState<{ original: string, normalized: string }[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [isRefreshingFiles, setIsRefreshingFiles] = useState(false);
  
  // External hooks
  const { showNotification } = useNotification();
  const findingFilesJob = useBackgroundJob(findingFilesJobId);
  
  // Reset function to clear all file selection state
  const reset = useCallback(() => {
    console.log('[FileSelectionState] Resetting file selection state');
    
    // Reset UI state
    setSearchTerm("");
    setPastedPaths("");
    setExternalPathWarnings([]);
    setSearchSelectedFilesOnly(false);
    setShowOnlySelected(false);
    
    // Reset background job state
    setIsFindingFiles(false);
    setFindingFilesJobId(null);
    
    // Reset loading state
    setIsLoadingFiles(false);
    setLoadingStatus("");
    setIsRefreshingFiles(false);
    
    // Reset debug info
    setPathDebugInfo([]);
    
    // Reset file maps - can optionally keep if files should persist
    setAllFilesMap({});
    setFileContentsMap({});
    
    // Reset ref values
    sessionSelectionsAppliedRef.current = false;
    
    // Force reset the last loaded time
    loadFilesRef.current.lastLoaded = {};
    loadFilesRef.current.isLoading = false;
  }, []);
  
  // Instead, we'll just expose a direct method to update the paths after job completion
  const updatePathsAfterJobCompletion = useCallback((paths: string[]) => {
    if (!paths || paths.length === 0) return;
    
    console.log(`[useFileSelectionState] Updating paths after job completion with ${paths.length} paths:`, paths);
    
    // Update the pastedPaths field with the new paths - ensure they're joined with newlines
    setPastedPaths(paths.join('\n'));
    
    // Update the file map to mark these paths as included
    setAllFilesMap(prevMap => {
      const updatedMap = { ...prevMap };
      
      // Mark each path as included
      paths.forEach((path: string) => {
        if (updatedMap[path]) {
          updatedMap[path] = {
            ...updatedMap[path],
            included: true,
            forceExcluded: false
          };
        }
      });
      
      return updatedMap;
    });
    
    // Mark that we have unsaved changes
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
    
    // Call the interaction callback if provided
    if (onInteraction) {
      onInteraction();
    }
  }, [setHasUnsavedChanges, onInteraction]);

  // Track when files were last loaded to prevent frequent reloads
  const loadFilesRef = useRef<{ 
    lastLoaded: { [dir: string]: number },
    isLoading: boolean 
  }>({ 
    lastLoaded: {}, 
    isLoading: false 
  });

  // Keep track of whether we've applied session selections
  const sessionSelectionsAppliedRef = useRef(false);

  // Load files for a project directory
  const loadFiles = useCallback(async (
    dirToLoad: string, 
    mapToMerge?: FilesMap,
    applySessions?: {
      included: string[];
      excluded: string[];
    }
  ) => {
    const normalizedDir = normalizePath(dirToLoad);
    
    // Check if files were recently loaded
    const now = Date.now();
    const lastLoaded = loadFilesRef.current.lastLoaded[normalizedDir] || 0;
    const timeElapsed = now - lastLoaded;
    
    if (timeElapsed < MIN_LOAD_INTERVAL && Object.keys(allFilesMap).length > 0) {
      console.log(`[File Loader] Files were loaded ${timeElapsed}ms ago, skipping reload.`);
      return;
    }
    
    // Prevent concurrent loads
    if (loadFilesRef.current.isLoading) {
      console.log('[File Loader] File loading already in progress, skipping request.');
      return;
    }
    
    loadFilesRef.current.isLoading = true;
    setIsLoadingFiles(true);
    setLoadingStatus("Loading project files...");
    
    try {
      console.log(`[File Loader] Loading files for ${normalizedDir}`);
      
      // Read file list and contents from server action
      const result = await readDirectoryAction(normalizedDir);
      
      if (result.isSuccess && result.data) {
        // Got files and contents
        const fileContents = result.data;
        
        // Process file paths
        let filesMap: FilesMap = {};
        for (const filePath of Object.keys(fileContents)) {
          const content = fileContents[filePath];
          
          // Determine if file should be included by default
          const include = shouldIncludeByDefault(filePath);
          
          // Add to file map
          filesMap[filePath] = {
            path: filePath,
            size: content.length,
            included: include,
            forceExcluded: false
          };
        }
        
        // Preserve selection state if previous map is provided or mapToMerge is passed
        const mapToUse = mapToMerge || allFilesMap;
        if (mapToUse && Object.keys(mapToUse).length > 0) {
          console.log('[File Loader] Merging selection state from previous files map');
          filesMap = mergeFileMaps(mapToUse, filesMap);
        }
        
        // Apply session selections if explicitly provided in this call
        if (applySessions) {
          console.log('[File Loader] Applying explicit session selections');
          filesMap = applySessionSelections(
            filesMap, 
            applySessions.included, 
            applySessions.excluded
          );
        }
        
        // Update state
        setAllFilesMap(filesMap);
        setFileContentsMap(fileContents);
        console.log(`[File Loader] Loaded ${Object.keys(filesMap).length} files.`);
        
        // Record the load time
        loadFilesRef.current.lastLoaded[normalizedDir] = now;
      } else {
        console.error(`[File Loader] Failed to load files:`, result.message);
        setLoadingStatus(`Error: ${result.message}`);
      }
    } catch (error) {
      console.error('[File Loader] Exception loading files:', error);
      setLoadingStatus(`Error loading files.`);
    } finally {
      loadFilesRef.current.isLoading = false;
      setIsLoadingFiles(false);
      setLoadingStatus("");
    }
  }, [allFilesMap]);

  // Refresh files (clear cache and reload)
  const refreshFiles = useCallback(async (preserveState: boolean = false) => {
    if (!projectDirectory) {
      console.warn('[File Loader] Cannot refresh files - no project directory selected.');
      return;
    }
    
    if (isRefreshingFiles || isLoadingFiles) {
      console.warn('[File Loader] Already refreshing or loading files.');
      return;
    }
    
    setIsRefreshingFiles(true);
    setLoadingStatus("Refreshing project files...");
    
    try {
      console.log('[File Loader] Refreshing file cache...');
      
      // Clear caches first
      await Promise.all([
        invalidateDirectoryCache(projectDirectory),
        invalidateFileCache(projectDirectory)
      ]);
      
      // Force reset the last loaded time
      loadFilesRef.current.lastLoaded[projectDirectory] = 0;
      
      // Reset the session selections applied flag so we don't re-apply them
      // when refreshing (we want to keep our current selections, not restore session ones)
      sessionSelectionsAppliedRef.current = true;
      
      // Load files again, passing current map if preserving state
      if (preserveState) {
        console.log('[File Loader] Preserving selection state during refresh');
        await loadFiles(projectDirectory, allFilesMap);
      } else {
        await loadFiles(projectDirectory);
      }
      
      console.log('[File Loader] Files refreshed successfully.');
    } catch (error) {
      console.error('[File Loader] Error refreshing files:', error);
      setLoadingStatus(`Error refreshing files.`);
    } finally {
      setIsRefreshingFiles(false);
      setLoadingStatus("");
    }
  }, [projectDirectory, isRefreshingFiles, isLoadingFiles, loadFiles, allFilesMap]);

  // Derived state - calculate included and excluded paths
  const { includedPaths, excludedPaths } = useMemo(() => {
    const included = Object.values(allFilesMap)
      .filter(f => f.included && !f.forceExcluded)
      .map(f => f.path);
    
    const excluded = Object.values(allFilesMap)
      .filter(f => f.forceExcluded)
      .map(f => f.path);
    
    return { includedPaths: included, excludedPaths: excluded };
  }, [allFilesMap]);

  // Handle search term change
  const handleSearchTermChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (onInteraction) {
      onInteraction();
    }
  }, [onInteraction]);

  // Handle pasted paths change
  const handlePastedPathsChange = useCallback((value: string) => {
    setPastedPaths(value);
    if (onInteraction) {
      onInteraction();
    }
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
  }, [onInteraction, setHasUnsavedChanges]);

  // Save file selections to session state
  const saveFileSelections = useCallback(async (sessionId: string | null) => {
    if (!sessionId) return;
    
    try {
      console.log(`[FileSelectionState] Saving file selections for session: ${sessionId}`);
      
      // Add timestamp tracking to identify rapid calls
      const now = Date.now();
      const lastCallTime = (saveFileSelections as any).lastCallTime || 0;
      const timeSinceLastCall = now - lastCallTime;
      (saveFileSelections as any).lastCallTime = now;
      
      if (timeSinceLastCall < 5000) { // Check if less than 5 seconds since last call
        console.warn(`[FileSelectionState] Warning: saveFileSelections called again after only ${timeSinceLastCall}ms`);
      }
      
      // Extract included and excluded file paths
      const includedFiles: string[] = [];
      const excludedFiles: string[] = [];
      
      Object.values(allFilesMap).forEach(file => {
        if (file.included) {
          includedFiles.push(file.path);
        } else if (file.forceExcluded) {
          excludedFiles.push(file.path);
        }
      });
      
      if (debugMode) {
        // Log selection changes for debugging
        console.log({
          includedCount: includedFiles.length,
          excludedCount: excludedFiles.length,
          action: 'save',
          sessionId
        });
      }
      
      // Save changes - ensure sessionId is a string (not null)
      if (sessionId) {
        await sessionSyncService.updateSessionState(sessionId, {
          includedFiles,
          forceExcludedFiles: excludedFiles,
        });
      }
      
      // Reset unsaved changes flag
      if (setHasUnsavedChanges) {
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error('[FileSelectionState] Error saving file selections:', error);
    }
  }, [allFilesMap, debugMode, setHasUnsavedChanges]);
  
  // Create a debounced version of saveFileSelections
  const debouncedSaveFileSelections = useCallback((sessionId: string | null) => {
    const debouncedFn = debounce((id: string | null) => {
      console.log('[FileSelectionState] Debounced save file selections triggered');
      saveFileSelections(id);
    }, 3500); // Increased from 2500ms to 3500ms to reduce frequency
    
    debouncedFn(sessionId);
  }, [saveFileSelections]);

  // Track pending changes to batch updates
  const pendingChangesRef = useRef<{count: number, lastChangeTime: number}>({count: 0, lastChangeTime: 0});

  // Track when the last save occurred
  const lastSaveTimeRef = useRef<number>(0);

  // Function to queue a save with batching
  const queueSaveFileSelections = useCallback((sessionId: string | null) => {
    if (!sessionId) return;
    
    const now = Date.now();
    pendingChangesRef.current.count++;
    pendingChangesRef.current.lastChangeTime = now;
    
    // Skip if a save was triggered very recently (under 2 seconds ago)
    const timeSinceLastSave = now - lastSaveTimeRef.current;
    if (timeSinceLastSave < 2000) {
      console.log(`[FileSelectionState] Skipping save request, last save was ${timeSinceLastSave}ms ago`);
      return;
    }
    
    // Either save now if we have accumulated several changes, or use the standard debounce
    if (pendingChangesRef.current.count >= 5) {
      console.log(`[FileSelectionState] Triggering immediate save after ${pendingChangesRef.current.count} accumulated changes`);
      saveFileSelections(sessionId);
      pendingChangesRef.current.count = 0;
      lastSaveTimeRef.current = now;
    } else {
      debouncedSaveFileSelections(sessionId);
    }
  }, [debouncedSaveFileSelections, saveFileSelections]);

  // Toggle file selection
  const toggleFileSelection = useCallback((filePath: string) => {
    if (!filePath || !allFilesMap[filePath]) return;
    
    setAllFilesMap(prevMap => {
      const updatedMap = { ...prevMap };
      updatedMap[filePath] = {
        ...updatedMap[filePath],
        included: !updatedMap[filePath].included,
        forceExcluded: false // Reset force excluded when toggling
      };
      return updatedMap;
    });
    
    if (onInteraction) {
      onInteraction();
    }
    
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
    
    // Save after a short delay using the batching queue
    if (activeSessionId) {
      queueSaveFileSelections(activeSessionId);
    }
  }, [allFilesMap, activeSessionId, queueSaveFileSelections, onInteraction, setHasUnsavedChanges]);
  
  // Toggle file exclusion
  const toggleFileExclusion = useCallback((filePath: string) => {
    if (!filePath || !allFilesMap[filePath]) return;
    
    setAllFilesMap(prevMap => {
      const updatedMap = { ...prevMap };
      updatedMap[filePath] = {
        ...updatedMap[filePath],
        forceExcluded: !updatedMap[filePath].forceExcluded,
        included: false // Reset included flag when toggling exclusion
      };
      return updatedMap;
    });
    
    if (onInteraction) {
      onInteraction();
    }
    
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
    
    // Save after a short delay using the batching queue
    if (activeSessionId) {
      queueSaveFileSelections(activeSessionId);
    }
  }, [allFilesMap, activeSessionId, queueSaveFileSelections, onInteraction, setHasUnsavedChanges]);

  // Find relevant files based on task description
  const findRelevantFiles = useCallback(async () => {
    if (!projectDirectory || !taskDescription.trim()) {
      showNotification({
        title: "Cannot find files",
        message: "Please provide a task description and ensure a project directory is selected.",
        type: "warning"
      });
      return;
    }
    
    if (isFindingFiles) {
      showNotification({
        title: "Already finding files",
        message: "Please wait for the current operation to complete.",
        type: "warning"
      });
      return;
    }
    
    setIsFindingFiles(true);
    
    // Determine which files to search in
    const filesToSearch = searchSelectedFilesOnly
      ? includedPaths
      : null; // null means all files in the project
      
    try {
      // Make sure we have a valid session ID to avoid SQLite binding error
      if (!activeSessionId) {
        throw new Error("No active session. Please create a session before finding relevant files.");
      }
      
      // Validate that activeSessionId is a string
      if (typeof activeSessionId !== 'string') {
        console.error(`[FileSelectionState] Invalid activeSessionId type: ${typeof activeSessionId}, value:`, activeSessionId);
        throw new Error("Invalid session ID format. Please create a new session.");
      }

      const result = await findRelevantFilesAction(
        activeSessionId,
        taskDescription,
        filesToSearch ? filesToSearch : [],
        [],
        {
          projectDirectory: normalizePath(projectDirectory)
        }
      );
      
      if (result.isSuccess && result.data) {
        if ('jobId' in result.data) {
          // Set the job ID to track completion
          setFindingFilesJobId(result.data.jobId);
          
          showNotification({
            title: "Finding relevant files",
            message: "This may take a moment...",
            type: "info"
          });
        } else if ('relevantPaths' in result.data) {
          // Handle immediate response (unlikely with the refactored implementation)
          const paths = (result.data as { relevantPaths: string[] }).relevantPaths;
          setIsFindingFiles(false);
          
          // Update all file map with the found paths
          if (paths.length > 0) {
            setAllFilesMap(prevMap => {
              const updatedMap = { ...prevMap };
              
              // Mark each path as included and ensure they're not force-excluded
              paths.forEach((path: string) => {
                if (updatedMap[path]) {
                  updatedMap[path] = {
                    ...updatedMap[path],
                    included: true,
                    forceExcluded: false
                  };
                }
              });
              
              return updatedMap;
            });
            
            // Update pastedPaths with the found paths
            setPastedPaths(paths.join('\n'));
            
            showNotification({
              title: "Relevant files found",
              message: `Found ${paths.length} relevant files for your task.`,
              type: "success"
            });
            
            // Auto-save file selections
            saveFileSelections(activeSessionId);
          } else {
            showNotification({
              title: "No relevant files found",
              message: "No files matched the search criteria. Try a different task description.",
              type: "warning"
            });
          }
        }
      } else {
        throw new Error(result.message || "Failed to start relevant file search.");
      }
    } catch (error) {
      console.error("[FileSelectionState] Error finding relevant files:", error);
      setIsFindingFiles(false);
      
      showNotification({
        title: "Error finding files",
        message: error instanceof Error ? error.message : "An unknown error occurred.",
        type: "error"
      });
    }
  }, [
    projectDirectory, 
    taskDescription, 
    isFindingFiles, 
    searchSelectedFilesOnly, 
    includedPaths, 
    showNotification,
    activeSessionId,
    saveFileSelections
  ]);

  // Set file selections from an updated map and paths list
  const setFileSelections = useCallback((updatedMap: FilesMap, includedPaths: string[]) => {
    // Update the file map
    setAllFilesMap(updatedMap);
    
    if (onInteraction) {
      onInteraction();
    }
    
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
  }, [onInteraction, setHasUnsavedChanges]);

  return useMemo(() => ({
    // File map state
    allFilesMap,
    fileContentsMap,
    includedPaths,
    excludedPaths,
    
    // UI related state
    searchTerm,
    pastedPaths,
    externalPathWarnings,
    searchSelectedFilesOnly,
    showOnlySelected,
    pathDebugInfo,
    
    // Loading state
    isLoadingFiles,
    loadingStatus,
    isRefreshingFiles,
    isFindingFiles,
    findingFilesJobId,
    
    // Setter functions
    setAllFilesMap,
    setFileContentsMap,
    setSearchTerm,
    setIsFindingFiles,
    setFindingFilesJobId,
    
    // File operations
    loadFiles,
    refreshFiles,
    toggleFileSelection,
    toggleFileExclusion,
    saveFileSelections,
    findRelevantFiles,
    setFileSelections,
    updatePathsAfterJobCompletion,
    
    // UI handlers
    handleSearchTermChange,
    handlePastedPathsChange,
    setSearchSelectedFilesOnly,
    setShowOnlySelected,
    setPastedPaths,
    setExternalPathWarnings,
    
    // Reset function
    reset
  }), [
    allFilesMap,
    fileContentsMap,
    includedPaths,
    excludedPaths,
    searchTerm,
    pastedPaths,
    externalPathWarnings,
    searchSelectedFilesOnly,
    showOnlySelected,
    pathDebugInfo,
    isLoadingFiles,
    loadingStatus,
    isRefreshingFiles,
    isFindingFiles,
    findingFilesJobId,
    loadFiles,
    refreshFiles,
    toggleFileSelection,
    toggleFileExclusion,
    saveFileSelections,
    findRelevantFiles,
    setFileSelections,
    updatePathsAfterJobCompletion,
    handleSearchTermChange,
    handlePastedPathsChange,
    reset
  ]);
} 