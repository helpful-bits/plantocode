"use client";

import { useRef, useCallback, useEffect, useState, useMemo } from "react";

import { useSessionStateContext } from "@/contexts/session";

import { type FileManagementContextValue } from "../_contexts/file-management-context";

import { useFileSelectionManager } from "./file-management/use-file-selection-manager";
import { useFileSessionSync } from "./file-management/use-file-session-sync";
import {
  useProjectFileList,
  type FileInfo,
} from "./file-management/use-project-file-list";
import { useRelevantFilesFinder } from "./file-management/use-relevant-files-finder";




interface UseFileManagementStateProps {
  projectDirectory: string;
  taskDescription: string;
  isTransitioningSession?: boolean;
}

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
  projectDirectory,
  taskDescription,
  isTransitioningSession = false,
}: UseFileManagementStateProps): FileManagementContextValue {
  const { activeSessionId } = useSessionStateContext();

  // SECTION 1: UI STATE - Managed directly in this hook as it's UI coordination
  const [filterMode, setFilterModeState] = useState<
    "all" | "selected" | "regex"
  >("all");
  const [findFilesMode, setFindFilesMode] = useState<"replace" | "extend">(
    "extend"
  );

  // File contents are loaded on-demand only for UI preview purposes
  // The backend will handle reading file contents for AI operations directly
  const [fileContentsMap, setFileContentsMap] = useState<
    Record<string, string>
  >({});

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

  // Handler for paths found by AI - translates paths into selection actions
  const handlePathsFoundByAI = useCallback(
    (paths: string[]) => {
      if (paths.length > 0) {
        // Directly use the appropriate function based on the mode
        if (findFilesMode === "replace") {
          replaceSelectionWithPaths(paths);
        } else {
          addPathsToSelection(paths);
        }

        // Explicitly set filter mode to 'selected' when we get results
        setFilterModeState("selected");
      }
    },
    [findFilesMode, replaceSelectionWithPaths, addPathsToSelection]
  );

  // SECTION 6: AI INTEGRATION - For finding relevant files with AI
  const relevantFilesFinder = useRelevantFilesFinder({
    activeSessionId,
    projectDirectory,
    taskDescription,
    includedPaths: fileSelectionManager.includedPaths,
    searchSelectedFilesOnly,
    onComplete: handlePathsFoundByAI,
  });

  // Function to find relevant files - coordination between user action and AI service
  const findRelevantFilesCallback = useCallback(async (): Promise<void> => {
    if (!taskDescription.trim() || relevantFilesFinder.isFindingFiles) {
      return;
    }

    try {
      await relevantFilesFinder.executeFindRelevantFiles();
    } catch (error) {
      console.error(
        "[FileManagementState] Error finding relevant files:",
        error
      );
    }
  }, [relevantFilesFinder, taskDescription]);

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
    (mode: "all" | "selected" | "regex") => {
      setFilterModeState(mode);
    },
    []
  );

  // Set up an event listener to handle filter mode changes from regex generation
  useEffect(() => {
    const handleSetFilterModeToRegex = () => {
      setFilterModeState("regex");
    };

    window.addEventListener("setFilterModeToRegex", handleSetFilterModeToRegex);

    return () => {
      window.removeEventListener(
        "setFilterModeToRegex",
        handleSetFilterModeToRegex
      );
    };
  }, []);

  // Automatically switch to "selected" filter mode ONLY when files are NEWLY selected (0 to N)
  useEffect(() => {
    const currentLength = fileSelectionManager.includedPaths.length;

    // Only switch to "selected" mode if:
    // 1. We previously had no files AND now we have files (newly selected)
    // 2. Current filter mode is "all" (respect user's explicit choice otherwise)
    if (
      prevIncludedPathsLengthRef.current === 0 &&
      currentLength > 0 &&
      filterMode === "all"
    ) {
      setFilterModeState("selected");
    }

    // Update our reference for next render
    prevIncludedPathsLengthRef.current = currentLength;
  }, [fileSelectionManager.includedPaths, filterMode]);

  // Lazy-load file contents ONLY for UI preview purposes
  // This is separate from the backend operations which read files directly
  useEffect(() => {
    // Only load file contents when we have files selected and need to show them in the UI
    if (fileSelectionManager.includedPaths.length === 0 || !projectDirectory) {
      return;
    }

    // Import and use the file content loader utility only when needed
    void import("@/utils/file-content-loader").then(({ loadFileContents }) => {
      // Use callback to get current state and avoid dependency
      setFileContentsMap((currentContents) => {
        // Filter out files that already have content loaded
        const filesToLoad = fileSelectionManager.includedPaths.filter(
          (path) =>
            !currentContents[path] ||
            currentContents[path].includes("[Error") ||
            currentContents[path].includes("[File not found]")
        );

        // Skip if no new files to load
        if (filesToLoad.length === 0) {
          return currentContents;
        }

        // Load file contents for UI preview only - limited to first 5 files
        // for performance reasons. The backend will load complete files when needed.
        loadFileContents(
          projectDirectory,
          filesToLoad.slice(0, 5),
          currentContents
        )
          .then((contents) => {
            setFileContentsMap(contents);
          })
          .catch((error) => {
            console.error(
              "[FileManagementState] Error loading file contents for UI preview:",
              error
            );
          });

        // Return current state unchanged for now - async operation will update it
        return currentContents;
      });
    });
  }, [projectDirectory, fileSelectionManager.includedPaths]);

  // Calculate if regex is available based on patterns from session
  const { currentSession } = useSessionStateContext();
  const isRegexAvailable = Boolean(
    currentSession?.titleRegex?.trim() ||
      currentSession?.contentRegex?.trim() ||
      currentSession?.negativeTitleRegex?.trim() ||
      currentSession?.negativeContentRegex?.trim()
  );

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
      isRegexAvailable,
      externalPathWarnings: fileSelectionManager.externalPathWarnings,
      includedPaths: fileSelectionManager.includedPaths,
      excludedPaths: fileSelectionManager.excludedPaths,
      searchSelectedFilesOnly,
      canUndo: fileSelectionManager.canUndo,
      canRedo: fileSelectionManager.canRedo,
      findFilesMode,

      // FILE CONTENTS
      fileContentsMap, // Now an empty object, backend handles file content loading

      // AI INTEGRATION STATE
      isFindingFiles: Boolean(relevantFilesFinder.isFindingFiles),
      findingFilesJobId: relevantFilesFinder.findingFilesJobId,

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
      // File list dependencies
      fileSelectionManager.managedFilesMap,
      isLoadingFiles,
      isInitialized,
      fileLoadError,
      refreshFiles,

      // Selection state dependencies
      searchTerm,
      filterMode,
      isRegexAvailable,
      fileSelectionManager.externalPathWarnings,
      fileSelectionManager.includedPaths,
      fileSelectionManager.excludedPaths,
      searchSelectedFilesOnly,
      fileSelectionManager.canUndo,
      fileSelectionManager.canRedo,
      findFilesMode,

      // AI integration dependencies
      relevantFilesFinder.isFindingFiles,
      relevantFilesFinder.findingFilesJobId,

      // Action dependencies
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

      // Session dependencies
      getFileStateForSession,
      flushFileStateSaves,
      fileSelectionManager.flushPendingOperations,
    ]
  );

  return contextValue;
}
