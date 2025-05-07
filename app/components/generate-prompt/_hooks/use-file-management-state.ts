"use client";

import { useRef, useMemo, useCallback, useEffect } from "react";
import { useProjectFileList, FileInfo } from "./file-management/use-project-file-list";
import { useFileSelectionManager } from "./file-management/use-file-selection-manager";
import { useRelevantFilesFinder } from "./file-management/use-relevant-files-finder";
import { FileManagementContextValue } from "../_contexts/file-management-context";
import { normalizePathForComparison, makePathRelative } from "@/lib/path-utils";
import { JOB_STATUSES } from "@/types/session-types";

interface UseFileManagementStateProps {
  projectDirectory: string;
  activeSessionId: string | null;
  taskDescription: string;
  onInteraction?: () => void;
  sessionData?: {
    includedFiles?: string[];
    forceExcludedFiles?: string[];
    searchTerm?: string;
    searchSelectedFilesOnly?: boolean;
  };
  isSwitchingSession?: boolean;
}

export function useFileManagementState({
  projectDirectory,
  activeSessionId,
  taskDescription,
  onInteraction,
  sessionData,
  isSwitchingSession = false,
}: UseFileManagementStateProps): FileManagementContextValue {
  // Used to track state for session saving
  const currentFileStateRef = useRef<{
    searchTerm: string;
    includedFiles: string[];
    forceExcludedFiles: string[];
    searchSelectedFilesOnly: boolean;
  }>({
    searchTerm: "",
    includedFiles: [],
    forceExcludedFiles: [],
    searchSelectedFilesOnly: false,
  });

  // Call onInteraction when state changes if provided
  const handleInteraction = useCallback(() => {
    if (onInteraction) {
      onInteraction();
    }
  }, [onInteraction]);

  // Basic file loading and refreshing
  const {
    rawFilesMap,
    isLoading: isLoadingFiles,
    error: fileLoadError,
    refreshFiles: originalRefreshFiles,
  } = useProjectFileList(projectDirectory);

  // Wrap refreshFiles to return void instead of boolean
  const refreshFiles = useCallback(async (): Promise<void> => {
    await originalRefreshFiles();
    // Return void to match the interface
  }, [originalRefreshFiles]);

  // File selection management
  const fileSelectionManager = useFileSelectionManager({
    rawFilesMap,
    sessionIncludedFiles: sessionData?.includedFiles,
    sessionExcludedFiles: sessionData?.forceExcludedFiles,
    initialSearchSelectedFilesOnly: sessionData?.searchSelectedFilesOnly,
    initialSearchTerm: sessionData?.searchTerm,
    onInteraction: handleInteraction,
    isSwitchingSession
  });
  
  // Log changes to file selection state for debugging
  useEffect(() => {
    console.log(`[FileManagementState] Selection state updated: ${fileSelectionManager.includedPaths.length} included, ${fileSelectionManager.excludedPaths.length} excluded`);
  }, [fileSelectionManager.includedPaths, fileSelectionManager.excludedPaths]);

  const {
    managedFilesMap,
    searchTerm,
    showOnlySelected,
    externalPathWarnings,
    searchSelectedFilesOnly,
    includedPaths,
    excludedPaths,
    setSearchTerm,
    setShowOnlySelected,
    toggleFileSelection,
    toggleFileExclusion,
    toggleSearchSelectedFilesOnly,
    handleBulkToggle,
    applySelectionsFromPaths,
    replaceAllSelectionsWithPaths,
  } = fileSelectionManager;

  // AI relevant file finding - simplified
  const {
    isFindingFiles,
    findingFilesJobId,
    error: findFilesError,
    findingFilesJobResult,
    executeFindRelevantFiles,
  } = useRelevantFilesFinder({
    activeSessionId,
    projectDirectory, 
    taskDescription,
    includedPaths,
    searchSelectedFilesOnly
  });


  // Track previous session ID to detect changes
  const prevActiveSessionIdRef = useRef<string | null>(null);
  
  // Reset tracking when session changes
  useEffect(() => {
    if (activeSessionId !== prevActiveSessionIdRef.current) {
      prevActiveSessionIdRef.current = activeSessionId;
      console.log(`[FileManagementState] Session changed to ${activeSessionId}, resetting load flags`);
    }
  }, [activeSessionId]);

  // Update state ref for session saving
  useEffect(() => {
    // Project-relative paths are already normalized via file selection manager
    currentFileStateRef.current = {
      searchTerm,
      includedFiles: includedPaths, // These are already project-relative paths
      forceExcludedFiles: excludedPaths, // These are already project-relative paths
      searchSelectedFilesOnly,
    };
  }, [searchTerm, includedPaths, excludedPaths, searchSelectedFilesOnly]);


  // Function to execute find relevant files
  const findRelevantFilesCallback = useCallback(async (): Promise<void> => {
    if (!taskDescription.trim() || isFindingFiles) {
      return;
    }
    
    try {
      await executeFindRelevantFiles();
    } catch (error) {
      console.error("[FileManagement] Error finding relevant files:", error);
    }
  }, [executeFindRelevantFiles, taskDescription, isFindingFiles]);
  
  // React to completed find relevant files jobs
  useEffect(() => {
    // Check if we have a valid job result
    if (findingFilesJobResult?.status === JOB_STATUSES.COMPLETED[0] && 
        typeof findingFilesJobResult.response === 'string') {
      
      console.log('[FileManagementState] Processing completed find relevant files job');
      
      // Parse paths from the response
      const pathsFromResponse = findingFilesJobResult.response
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      
      // Normalize paths for consistent comparison
      const normalizedPaths = pathsFromResponse.map(p => normalizePathForComparison(p));
      
      if (normalizedPaths.length > 0) {
        console.log(`[FileManagementState] Adding ${normalizedPaths.length} paths from Gemini to selection`);
        
        // Apply the paths to the current selection (merging on UI side)
        applySelectionsFromPaths(normalizedPaths);
        
        // Set showOnlySelected to true to show only the selected files
        setShowOnlySelected(true);
        
        // Trigger interaction to save state
        handleInteraction();
      }
    }
  }, [findingFilesJobResult, applySelectionsFromPaths, setShowOnlySelected, handleInteraction]);

  // Function to get current file state for session saving
  const getFileStateForSession = useCallback(() => {
    // Get the most up-to-date values from the fileSelectionManager
    return {
      searchTerm: fileSelectionManager.searchTerm,
      includedFiles: fileSelectionManager.includedPaths,
      forceExcludedFiles: fileSelectionManager.excludedPaths,
      searchSelectedFilesOnly: fileSelectionManager.searchSelectedFilesOnly,
      pastedPaths: ""
    };
  }, [fileSelectionManager]);

  // Adapter for handleBulkToggle that swaps parameter order
  const adaptedHandleBulkToggle = useCallback((files: FileInfo[], include: boolean) => {
    handleBulkToggle(include, files);
  }, [handleBulkToggle]);

  // Create the context value
  return useMemo(
    () => ({
      // State
      managedFilesMap,
      searchTerm,
      showOnlySelected,
      externalPathWarnings,
      includedPaths,
      excludedPaths,
      searchSelectedFilesOnly,
      isLoadingFiles,
      isFindingFiles: Boolean(isFindingFiles), // Ensure it's a boolean
      findingFilesJobId,
      fileContentsMap: {},

      // Actions
      setSearchTerm,
      setShowOnlySelected,
      toggleFileSelection,
      toggleFileExclusion,
      toggleSearchSelectedFilesOnly,
      handleBulkToggle: adaptedHandleBulkToggle,
      applySelectionsFromPaths,
      findRelevantFiles: findRelevantFilesCallback,
      refreshFiles,
      
      // Session state extraction
      getFileStateForSession,
      
      // Forward the flush operation
      flushPendingOperations: fileSelectionManager.flushPendingOperations
    }),
    [
      managedFilesMap,
      searchTerm,
      showOnlySelected,
      externalPathWarnings,
      includedPaths,
      excludedPaths,
      searchSelectedFilesOnly,
      isLoadingFiles,
      isFindingFiles,
      findingFilesJobId,
      setSearchTerm,
      setShowOnlySelected,
      toggleFileSelection,
      toggleFileExclusion,
      toggleSearchSelectedFilesOnly,
      adaptedHandleBulkToggle,
      applySelectionsFromPaths,
      findRelevantFilesCallback,
      refreshFiles,
      getFileStateForSession,
      fileSelectionManager.flushPendingOperations
    ]
  );
}