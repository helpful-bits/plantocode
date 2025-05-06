"use client";

import { useRef, useMemo, useCallback, useEffect } from "react";
import { useProjectFileList, FileInfo } from "./file-management/use-project-file-list";
import { useFileSelectionManager } from "./file-management/use-file-selection-manager";
import { useRelevantFilesFinder } from "./file-management/use-relevant-files-finder";
import { FileManagementContextValue } from "../_contexts/file-management-context";
import { normalizePathForComparison } from "@/lib/path-utils";
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
    pastedPaths?: string;
    searchSelectedFilesOnly?: boolean;
  };
}

export function useFileManagementState({
  projectDirectory,
  activeSessionId,
  taskDescription,
  onInteraction,
  sessionData,
}: UseFileManagementStateProps): FileManagementContextValue {
  // Used to track state for session saving
  const currentFileStateRef = useRef<{
    searchTerm: string;
    pastedPaths: string;
    includedFiles: string[];
    forceExcludedFiles: string[];
    searchSelectedFilesOnly: boolean;
  }>({
    searchTerm: "",
    pastedPaths: "",
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
    sessionIncludedFiles: sessionData?.includedFiles || [],
    sessionExcludedFiles: sessionData?.forceExcludedFiles || [],
    onInteraction: handleInteraction
  });

  const {
    managedFilesMap,
    searchTerm,
    showOnlySelected,
    pastedPaths,
    externalPathWarnings,
    searchSelectedFilesOnly,
    includedPaths,
    excludedPaths,
    setSearchTerm,
    setShowOnlySelected,
    setPastedPaths,
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

  // Update session data when changes occur
  useEffect(() => {
    if (sessionData?.searchTerm !== undefined && sessionData.searchTerm !== searchTerm) {
      setSearchTerm(sessionData.searchTerm);
    }
  }, [sessionData?.searchTerm, searchTerm, setSearchTerm]);

  useEffect(() => {
    if (sessionData?.pastedPaths !== undefined && sessionData.pastedPaths !== pastedPaths) {
      setPastedPaths(sessionData.pastedPaths);
    }
  }, [sessionData?.pastedPaths, pastedPaths, setPastedPaths]);

  // Track if we've loaded the initial searchSelectedFilesOnly state
  const hasLoadedSearchSelectedRef = useRef(false);
  
  // Load searchSelectedFilesOnly from session data (only once)
  useEffect(() => {
    if (
      !hasLoadedSearchSelectedRef.current &&
      sessionData?.searchSelectedFilesOnly !== undefined && 
      sessionData.searchSelectedFilesOnly !== searchSelectedFilesOnly
    ) {
      // Mark as loaded so we don't trigger this again
      hasLoadedSearchSelectedRef.current = true;
      
      // Need to handle this specially since it's a toggle
      // Use the value overload rather than the toggle function to avoid infinite loops
      toggleSearchSelectedFilesOnly(sessionData.searchSelectedFilesOnly);
    }
  }, [
    sessionData?.searchSelectedFilesOnly,
    toggleSearchSelectedFilesOnly,
    searchSelectedFilesOnly
  ]);

  // Update state ref for session saving
  useEffect(() => {
    currentFileStateRef.current = {
      searchTerm,
      pastedPaths,
      includedFiles: includedPaths,
      forceExcludedFiles: excludedPaths,
      searchSelectedFilesOnly,
    };
  }, [searchTerm, pastedPaths, includedPaths, excludedPaths, searchSelectedFilesOnly]);

  
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
        
        // Trigger interaction to save state
        handleInteraction();
      }
    }
  }, [findingFilesJobResult, applySelectionsFromPaths, handleInteraction]);

  // Function to get current file state for session saving
  const getFileStateForSession = useCallback(() => {
    return currentFileStateRef.current;
  }, []);

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
      pastedPaths,
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
      setPastedPaths,
      toggleFileSelection,
      toggleFileExclusion,
      toggleSearchSelectedFilesOnly,
      handleBulkToggle: adaptedHandleBulkToggle,
      applySelectionsFromPaths,
      findRelevantFiles: findRelevantFilesCallback,
      refreshFiles,
      
      // Session state extraction
      getFileStateForSession,
    }),
    [
      managedFilesMap,
      searchTerm,
      showOnlySelected,
      pastedPaths,
      externalPathWarnings,
      includedPaths,
      excludedPaths,
      searchSelectedFilesOnly,
      isLoadingFiles,
      isFindingFiles,
      findingFilesJobId,
      setSearchTerm,
      setShowOnlySelected,
      setPastedPaths,
      toggleFileSelection,
      toggleFileExclusion,
      toggleSearchSelectedFilesOnly,
      adaptedHandleBulkToggle,
      applySelectionsFromPaths,
      findRelevantFilesCallback,
      refreshFiles,
      getFileStateForSession,
    ]
  );
}