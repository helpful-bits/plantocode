"use client";

import { useRef, useCallback, useEffect, useState, useMemo } from "react";

import { useSessionStateContext } from "@/contexts/session";
import { useProject } from "@/contexts/project-context";

import { type FileManagementContextValue } from "../_contexts/file-management-context";

import { useFileSelectionManager } from "./file-management/use-file-selection-manager";
import { useFileSessionSync } from "./file-management/use-file-session-sync";
import {
  useProjectFileList,
  type FileInfo,
} from "./file-management/use-project-file-list";
import { useFileFinderWorkflow } from "./file-management/workflow/useFileFinderWorkflow";




interface UseFileManagementStateProps {}

/**
 * Main hook for file management state
 * Acts as an integrator of specialized sub-hooks for different aspects of file management
 *
 * This hook is now broken down into more focused sections:
 * 1. UI state management (filter modes, UI flags)
 * 2. Project file list state (from useProjectFileList)
 * 3. File selection state (from useFileSelectionManager)
 * 4. Session synchronization (from useFileSessionSync)
 * 5. AI integration for finding relevant files (from useRelevantFilesFinder)
 * 6. File contents loading - REMOVED as backend now handles file loading
 */
export function useFileManagementState({
}: UseFileManagementStateProps): FileManagementContextValue {
  const { projectDirectory } = useProject();
  const { activeSessionId, isSessionLoading: isTransitioningSession, currentSession } = useSessionStateContext();
  const taskDescription = currentSession?.taskDescription || "";

  // SECTION 1: UI STATE - Managed directly in this hook as it's UI coordination
  const [filterMode, setFilterModeState] = useState<
    "all" | "selected"
  >("all");
  const [findFilesMode, setFindFilesMode] = useState<"replace" | "extend">(
    "extend"
  );


  // Track previous includedPaths length to detect new selections
  const prevIncludedPathsLengthRef = useRef<number>(0);

  // SECTION 2: SESSION SYNCHRONIZATION - Via useFileSessionSync
  const fileSessionSync = useFileSessionSync();
  const {
    searchTerm,
    searchSelectedFilesOnly,
    updateSearchTerm,
    updateSearchSelectedOnly,
    syncFileSelectionsToSession,
    getFileStateForSession,
    flushFileStateSaves,
    sessionIncludedFiles,
    sessionForceExcludedFiles,
  } = fileSessionSync;

  // SECTION 3: PROJECT FILE LIST - Via useProjectFileList
  const projectFileListResult = useProjectFileList(
    projectDirectory,
    activeSessionId
  );
  const rawFilesMap = projectFileListResult.rawFilesMap;
  const isLoadingFiles = projectFileListResult.isLoading;
  const isInitialized = projectFileListResult.isInitialized;
  const fileLoadError = projectFileListResult.error;
  const originalRefreshFiles = projectFileListResult.refreshFiles;

  const refreshFiles = useCallback(async (): Promise<void> => {
    await originalRefreshFiles();
  }, [originalRefreshFiles]);

  // SECTION 4: FILE SELECTION MANAGEMENT - Via useFileSelectionManager
  const fileSelectionManager = useFileSelectionManager({
    rawFilesMap,
    currentIncludedFiles: sessionIncludedFiles,
    currentExcludedFiles: sessionForceExcludedFiles,
    currentSearchTerm: searchTerm,
    currentSearchSelectedFilesOnly: searchSelectedFilesOnly,
    onUpdateIncludedFiles: (paths) =>
      syncFileSelectionsToSession(paths, sessionForceExcludedFiles),
    onUpdateExcludedFiles: (paths) =>
      syncFileSelectionsToSession(sessionIncludedFiles, paths),
    onUpdateSearchTerm: updateSearchTerm,
    onUpdateSearchSelectedOnly: updateSearchSelectedOnly,
    isTransitioningSession,
    activeSessionId,
  });

  // Auto-initialize file list when project and session are ready
  useEffect(() => {
    if (projectDirectory && activeSessionId && !isInitialized && !isLoadingFiles) {
      refreshFiles().catch(() => {
        // Error handled by refreshFiles
      });
    }
  }, [projectDirectory, activeSessionId, isInitialized, isLoadingFiles, refreshFiles]);

  // SECTION 5: PATH SELECTION HELPERS - Bridging file selection with AI results
  // Create dedicated functions for adding/replacing paths
  const addPathsToSelection = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;

      // Use applySelectionsFromPaths which naturally adds to existing selection
      fileSelectionManager.applySelectionsFromPaths(paths);
      fileSelectionManager.setShowOnlySelected(true);
    },
    [fileSelectionManager]
  );

  const replaceSelectionWithPaths = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;

      // Use replaceAllSelectionsWithPaths which naturally replaces existing selection
      fileSelectionManager.replaceAllSelectionsWithPaths(paths);
      fileSelectionManager.setShowOnlySelected(true);
    },
    [fileSelectionManager]
  );


  // SECTION 6: FILE FINDER INTEGRATION - For finding relevant files
  const fileFinderWorkflow = useFileFinderWorkflow({
    activeSessionId: activeSessionId || "",
    projectDirectory: projectDirectory || "",
    taskDescription,
    excludedPaths: fileSelectionManager.excludedPaths,
    rawFilesMap: rawFilesMap || {},
    replaceSelection: replaceSelectionWithPaths,
    extendSelection: addPathsToSelection,
    timeout: 120000, // 2 minute timeout
  });

  // Function to find relevant files - coordination between user action and file finder service
  // Handles cases where activeSessionId or projectDirectory might not be ready yet
  const findRelevantFilesCallback = useCallback(async (): Promise<void> => {
    if (!taskDescription.trim() || fileFinderWorkflow.isWorkflowRunning || !activeSessionId || !projectDirectory) {
      return;
    }

    try {
      await fileFinderWorkflow.executeWorkflow();
    } catch (error) {
      console.error(
        "[FileManagementState] Error finding relevant files:",
        error
      );
    }
  }, [taskDescription, fileFinderWorkflow, activeSessionId, projectDirectory]);

  // SECTION 7: UI ADAPTERS - Interface adapters for consumer components
  // Adapter for bulk toggle to match expected interface
  const adaptedHandleBulkToggle = useCallback(
    (files: FileInfo[], include: boolean) => {
      void fileSelectionManager.handleBulkToggle(include, files);
    },
    [fileSelectionManager]
  );

  // SECTION 8: UI EVENT HANDLERS - For UI interactions
  // Handler for filter mode changes
  const handleFilterModeChange = useCallback(
    (mode: "all" | "selected") => {
      setFilterModeState(mode);
    },
    []
  );

  // Track previous includedPaths length for potential future use
  useEffect(() => {
    const currentLength = fileSelectionManager.includedPaths.length;
    
    // Update our reference for next render
    prevIncludedPathsLengthRef.current = currentLength;
  }, [fileSelectionManager.includedPaths]);


  // Calculate if regex is available based on patterns from session
  // SECTION 9: CONTEXT VALUE CONSTRUCTION - Organized by feature area
  const contextValue = useMemo(
    () => ({
      // FILE LIST STATE
      managedFilesMap: fileSelectionManager.managedFilesMap,
      isLoadingFiles,
      isInitialized,
      fileLoadError,
      refreshFiles,

      // SELECTION STATE
      searchTerm,
      filterMode,
      externalPathWarnings: fileSelectionManager.externalPathWarnings,
      includedPaths: fileSelectionManager.includedPaths,
      excludedPaths: fileSelectionManager.excludedPaths,
      searchSelectedFilesOnly,
      canUndo: fileSelectionManager.canUndo,
      canRedo: fileSelectionManager.canRedo,
      findFilesMode,

      // FILE CONTENTS - Backend handles file content loading, no UI preview needed
      fileContentsMap: {},

      // FILE FINDER INTEGRATION STATE
      isFindingFiles: Boolean(fileFinderWorkflow.isWorkflowRunning),
      findingFilesJobId: undefined, // No longer available in new workflow
      currentWorkflowStage: fileFinderWorkflow.currentStage,
      workflowError: fileFinderWorkflow.workflowError,

      // SELECTION ACTIONS
      setSearchTerm: updateSearchTerm,
      setFilterMode: handleFilterModeChange,
      toggleFileSelection: fileSelectionManager.toggleFileSelection,
      toggleFileExclusion: fileSelectionManager.toggleFileExclusion,
      toggleSearchSelectedFilesOnly: updateSearchSelectedOnly,
      handleBulkToggle: adaptedHandleBulkToggle,
      undoSelection: fileSelectionManager.undoSelection,
      redoSelection: fileSelectionManager.redoSelection,

      // AI INTEGRATION ACTIONS
      addPathsToSelection,
      replaceSelectionWithPaths,
      findRelevantFiles: findRelevantFilesCallback,
      setFindFilesMode,

      // SESSION SYNCHRONIZATION
      getFileStateForSession,
      flushFileStateSaves,
      flushPendingOperations: fileSelectionManager.flushPendingOperations,
    }),
    [
      // Core file management state
      fileSelectionManager.managedFilesMap,
      isLoadingFiles,
      isInitialized,
      fileLoadError,
      refreshFiles,

      // Search and filter state
      searchTerm,
      filterMode,
      searchSelectedFilesOnly,
      findFilesMode,

      // Selection state
      fileSelectionManager.externalPathWarnings,
      fileSelectionManager.includedPaths,
      fileSelectionManager.excludedPaths,
      fileSelectionManager.canUndo,
      fileSelectionManager.canRedo,

      // File finder integration state
      fileFinderWorkflow.isWorkflowRunning,
      fileFinderWorkflow.currentStage,
      fileFinderWorkflow.workflowError,

      // Action callbacks
      updateSearchTerm,
      handleFilterModeChange,
      fileSelectionManager.toggleFileSelection,
      fileSelectionManager.toggleFileExclusion,
      updateSearchSelectedOnly,
      adaptedHandleBulkToggle,
      fileSelectionManager.undoSelection,
      fileSelectionManager.redoSelection,
      addPathsToSelection,
      replaceSelectionWithPaths,
      findRelevantFilesCallback,
      setFindFilesMode,

      // Session synchronization
      getFileStateForSession,
      flushFileStateSaves,
      fileSelectionManager.flushPendingOperations,
    ]
  );

  return contextValue;
}
