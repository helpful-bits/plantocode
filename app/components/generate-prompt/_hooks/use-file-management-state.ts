"use client";

import { useRef, useMemo, useCallback, useEffect } from "react";
import { useProjectFileList, FileInfo } from "./file-management/use-project-file-list";
import { useFileSelectionManager } from "./file-management/use-file-selection-manager";
import { useRelevantFilesFinder } from "./file-management/use-relevant-files-finder";
import { FileManagementContextValue } from "../_contexts/file-management-context";

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
  } = fileSelectionManager;

  // AI relevant file finding
  const relevantFilesFinder = useRelevantFilesFinder({
    activeSessionId,
    projectDirectory, 
    taskDescription,
    includedPaths,
    searchSelectedFilesOnly
  });

  const {
    isFindingFiles,
    findingFilesJobId,
    error: findFilesError,
    findingFilesJobResult,
    executeFindRelevantFiles,
  } = relevantFilesFinder;

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

  // Load searchSelectedFilesOnly from session data (only once)
  useEffect(() => {
    if (
      sessionData?.searchSelectedFilesOnly !== undefined && 
      sessionData.searchSelectedFilesOnly !== searchSelectedFilesOnly
    ) {
      // Need to handle this specially since it's a toggle
      // Use the value overload rather than the toggle function to avoid infinite loops
      toggleSearchSelectedFilesOnly(sessionData.searchSelectedFilesOnly);
    }
  }, [
    // Only include sessionData?.searchSelectedFilesOnly to prevent re-running
    // This effect should only run when the session data changes, not when the toggle state changes
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

  // Wrapper for findRelevantFiles that handles errors
  const findRelevantFiles = useCallback(async () => {
    console.log("Find relevant files requested");
    if (!taskDescription) {
      console.log("No task description provided for finding files");
      return;
    }
    try {
      await executeFindRelevantFiles();
    } catch (error) {
      console.log("Error finding relevant files:", error);
      // Error is already captured in the hook
    }
  }, [taskDescription, executeFindRelevantFiles]);

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
      isFindingFiles,
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
      findRelevantFiles,
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
      findRelevantFiles,
      refreshFiles,
      getFileStateForSession,
    ]
  );
}