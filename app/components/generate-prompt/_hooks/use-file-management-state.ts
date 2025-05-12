"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { useProjectFileList, FileInfo } from "./file-management/use-project-file-list";
import { useFileSelectionManager } from "./file-management/use-file-selection-manager";
import { useRelevantFilesFinder } from "./file-management/use-relevant-files-finder";
import { FileManagementContextValue } from "../_contexts/file-management-context";
import { normalizePathForComparison, makePathRelative } from "@/lib/path-utils";
import { JOB_STATUSES, Session } from "@/types/session-types";
import { useSessionContext } from "@/lib/contexts/session-context";
import { useStableRef } from "./use-stable-refs";

interface UseFileManagementStateProps {
  projectDirectory: string;
  taskDescription: string;
  isTransitioningSession?: boolean;
}

export function useFileManagementState({
  projectDirectory,
  taskDescription,
  isTransitioningSession = false,
}: UseFileManagementStateProps): FileManagementContextValue {
  const {
    activeSessionId,
    currentSession,
    updateCurrentSessionFields,
    setSessionModified,
    saveCurrentSession
  } = useSessionContext();

  const projectFileListResult = useProjectFileList(projectDirectory);
  const rawFilesMap = projectFileListResult.rawFilesMap;
  const isLoadingFiles = projectFileListResult.isLoading;
  const isInitialized = projectFileListResult.isInitialized;
  const fileLoadError = projectFileListResult.error;
  const originalRefreshFiles = projectFileListResult.refreshFiles;
  const retryCount = projectFileListResult.retryCount;

  const refreshFiles = useCallback(async (): Promise<void> => {
    await originalRefreshFiles();
    // Return void to match the interface
  }, [originalRefreshFiles]);

  const includedFiles = currentSession?.includedFiles || [];
  const forceExcludedFiles = currentSession?.forceExcludedFiles || [];
  // Initialize search term state from session or default to empty string
  const [searchTerm, setSearchTermState] = useState<string>(
    currentSession?.searchTerm || ''
  );
  // Initialize search selected files only state from session or default to false
  const [searchSelectedFilesOnly, setSearchSelectedFilesOnlyState] = useState<boolean>(
    currentSession?.searchSelectedFilesOnly || false
  );
  const handleUpdateIncludedFiles = useCallback((paths: string[]) => {
    // Use setTimeout to defer the state update to the next microtask
    // This prevents the "Cannot update a component while rendering a different component" error
    setTimeout(() => {
      updateCurrentSessionFields({ includedFiles: paths });
      setSessionModified(true);
    }, 0);
  }, [updateCurrentSessionFields, setSessionModified]);

  const handleUpdateExcludedFiles = useCallback((paths: string[]) => {
    // Use setTimeout to defer the state update to the next microtask
    setTimeout(() => {
      updateCurrentSessionFields({ forceExcludedFiles: paths });
      setSessionModified(true);
    }, 0);
  }, [updateCurrentSessionFields, setSessionModified]);

  const handleUpdateSearchTerm = useCallback((term: string) => {
    // Update local state
    setSearchTermState(term);

    // Use setTimeout to defer the state update to the next microtask
    setTimeout(() => {
      updateCurrentSessionFields({ searchTerm: term });
      setSessionModified(true);
    }, 0);
  }, [updateCurrentSessionFields, setSessionModified]);

  // Add debounce ref for search selected files only
  const searchSelectedFilesOnlyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleUpdateSearchSelectedOnly = useCallback((value?: boolean) => {
    // Handle undefined by toggling the current value
    const newValue = value === undefined ? !searchSelectedFilesOnly : value;

    // Clear any pending timeouts
    if (searchSelectedFilesOnlyTimeoutRef.current) {
      clearTimeout(searchSelectedFilesOnlyTimeoutRef.current);
    }

    // Use a single debounced update to prevent flickering
    searchSelectedFilesOnlyTimeoutRef.current = setTimeout(() => {
      // Update local state first
      setSearchSelectedFilesOnlyState(newValue);

      // Then update session state
      updateCurrentSessionFields({ searchSelectedFilesOnly: newValue });
      setSessionModified(true);

      searchSelectedFilesOnlyTimeoutRef.current = null;
    }, 50); // Small delay to debounce rapid changes
  }, [updateCurrentSessionFields, setSessionModified, searchSelectedFilesOnly]);

  const fileSelectionManager = useFileSelectionManager({
    rawFilesMap,
    currentIncludedFiles: includedFiles,
    currentExcludedFiles: forceExcludedFiles,
    currentSearchTerm: searchTerm,
    currentSearchSelectedFilesOnly: searchSelectedFilesOnly,
    onUpdateIncludedFiles: handleUpdateIncludedFiles,
    onUpdateExcludedFiles: handleUpdateExcludedFiles,
    onUpdateSearchTerm: handleUpdateSearchTerm,
    onUpdateSearchSelectedOnly: handleUpdateSearchSelectedOnly,
    isTransitioningSession,
    activeSessionId
  });


  const flushFileStateSaves = useCallback(async () => {
    if (!activeSessionId) {
      return false;
    }

    try {
      // State updates already happen directly through props, just save the session
      const saveResult = await saveCurrentSession();

      return saveResult;
    } catch (error) {
      return false;
    }
  }, [activeSessionId, saveCurrentSession]);

  const prevIncludedCountRef = useRef<number>(0);
  const prevExcludedCountRef = useRef<number>(0);

  useEffect(() => {
    const includedCount = fileSelectionManager.includedPaths.length;
    const excludedCount = fileSelectionManager.excludedPaths.length;

    // Update refs with current values if there's a change
    if (includedCount !== prevIncludedCountRef.current ||
        excludedCount !== prevExcludedCountRef.current) {
      prevIncludedCountRef.current = includedCount;
      prevExcludedCountRef.current = excludedCount;
    }
  }, [fileSelectionManager.includedPaths.length, fileSelectionManager.excludedPaths.length]);

  const {
    managedFilesMap,
    showOnlySelected,
    externalPathWarnings,
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

  // Core UI state - moved up to fix variable declaration order
  const [filterMode, setFilterModeState] = useState<'all' | 'selected' | 'regex'>('all');
  const [findFilesMode, setFindFilesMode] = useState<'replace' | 'extend'>('extend');

  // Create dedicated functions for each mode to eliminate backward compatibility options
  const addPathsToSelection = useCallback((paths: string[]) => {
    if (paths.length === 0) return;

    // Use applySelectionsFromPaths which naturally adds to existing selection
    applySelectionsFromPaths(paths);
    setShowOnlySelected(true);
  }, [applySelectionsFromPaths, setShowOnlySelected]);

  const replaceSelectionWithPaths = useCallback((paths: string[]) => {
    if (paths.length === 0) return;

    // Use replaceAllSelectionsWithPaths which naturally replaces existing selection
    replaceAllSelectionsWithPaths(paths);
    setShowOnlySelected(true);
  }, [replaceAllSelectionsWithPaths, setShowOnlySelected]);

  const handlePathsFoundByAI = useCallback((paths: string[]) => {
    if (paths.length > 0) {
      // Directly use the appropriate function based on the mode
      if (findFilesMode === 'replace') {
        replaceSelectionWithPaths(paths);
      } else {
        addPathsToSelection(paths);
      }

      // Explicitly set filter mode to 'selected' when we get results
      setFilterModeState('selected');
    } else {
      console.log("[FileManagementState] No paths found by AI");
    }
  }, [findFilesMode, replaceSelectionWithPaths, addPathsToSelection, setFilterModeState]);

  const {
    isFindingFiles,
    findingFilesJobId,
    error: findFilesError,
    executeFindRelevantFiles,
  } = useRelevantFilesFinder({
    activeSessionId,
    projectDirectory,
    taskDescription,
    includedPaths,
    searchSelectedFilesOnly,
    onComplete: handlePathsFoundByAI
  });

  const prevActiveSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip operations during session transitions
    if (isTransitioningSession) {
      return;
    }

    if (activeSessionId !== prevActiveSessionIdRef.current) {
      prevActiveSessionIdRef.current = activeSessionId;

      // Explicitly call reset on fileSelectionManager when session changes
      fileSelectionManager.flushPendingOperations();

      // If we have no active session, we can simply log and return
      if (!activeSessionId) {
      }
    }
  }, [activeSessionId, isTransitioningSession, fileSelectionManager]);

  // Listen for session changes and update local state accordingly
  useEffect(() => {
    // Skip if we're transitioning between sessions to avoid flickering
    if (isTransitioningSession) {
      return;
    }

    // Update local state when session changes (but only from session load, not from local edits)
    if (currentSession) {
      // Only update if values are different to avoid unnecessary renders
      if (searchTerm !== currentSession.searchTerm) {
        setSearchTermState(currentSession.searchTerm || '');
      }

      // For searchSelectedFilesOnly, debounce the update to avoid flickering
      if (searchSelectedFilesOnly !== currentSession.searchSelectedFilesOnly &&
          // Only update if we don't have a pending timeout (prevents conflicts with user-initiated changes)
          !searchSelectedFilesOnlyTimeoutRef.current) {

        if (searchSelectedFilesOnlyTimeoutRef.current) {
          clearTimeout(searchSelectedFilesOnlyTimeoutRef.current);
        }

        searchSelectedFilesOnlyTimeoutRef.current = setTimeout(() => {
          setSearchSelectedFilesOnlyState(currentSession.searchSelectedFilesOnly || false);
          searchSelectedFilesOnlyTimeoutRef.current = null;
        }, 50);
      }
    }
  }, [currentSession?.id, isTransitioningSession, currentSession, searchTerm, searchSelectedFilesOnly]);


  const findRelevantFilesCallback = useCallback(async (): Promise<void> => {
    if (!taskDescription.trim() || isFindingFiles) {
      return;
    }

    try {
      await executeFindRelevantFiles();
    } catch (error) {
    }
  }, [executeFindRelevantFiles, taskDescription, isFindingFiles]);

  const getFileStateForSession = useCallback(() => {
    // Get the current values from the session context
    const fileState = {
      searchTerm: currentSession?.searchTerm || '',
      includedFiles: currentSession?.includedFiles || [],
      forceExcludedFiles: currentSession?.forceExcludedFiles || [],
      searchSelectedFilesOnly: currentSession?.searchSelectedFilesOnly || false,
      pastedPaths: ""
    };

    // Log the current state for debugging

    return fileState;
  }, [currentSession]);

  const adaptedHandleBulkToggle = useCallback((files: FileInfo[], include: boolean) => {
    handleBulkToggle(include, files);
  }, [handleBulkToggle]);

  // Handler for filter mode changes
  const handleFilterModeChange = useCallback((mode: 'all' | 'selected' | 'regex') => {
    setFilterModeState(mode);
  }, []);

  // Set up an event listener to handle filter mode changes from regex generation
  useEffect(() => {
    const handleSetFilterModeToRegex = () => {
      console.log('[FileManagementState] Received event to set filter mode to regex');
      setFilterModeState('regex');
    };

    window.addEventListener('setFilterModeToRegex', handleSetFilterModeToRegex);

    return () => {
      window.removeEventListener('setFilterModeToRegex', handleSetFilterModeToRegex);
    };
  }, []);

  // Calculate if regex is available based on patterns
  const isRegexAvailable = Boolean(currentSession?.titleRegex?.trim() ||
                                  currentSession?.contentRegex?.trim() ||
                                  currentSession?.negativeTitleRegex?.trim() ||
                                  currentSession?.negativeContentRegex?.trim());

  const stableContextValue = useStableRef({
    // State
    managedFilesMap,
    searchTerm,
    filterMode,
    isRegexAvailable,
    externalPathWarnings,
    includedPaths,
    excludedPaths,
    searchSelectedFilesOnly,
    isLoadingFiles,
    isInitialized,
    fileLoadError,
    isFindingFiles: Boolean(isFindingFiles),
    findingFilesJobId,
    fileContentsMap: {},
    findFilesMode,
    canUndo: fileSelectionManager.canUndo,
    canRedo: fileSelectionManager.canRedo,

    // Actions
    setSearchTerm: handleUpdateSearchTerm, // Use the handler that updates both local state and session
    setFilterMode: handleFilterModeChange,
    toggleFileSelection,
    toggleFileExclusion,
    toggleSearchSelectedFilesOnly: handleUpdateSearchSelectedOnly, // Use the handler that updates both local state and session
    handleBulkToggle: adaptedHandleBulkToggle,
    addPathsToSelection, // Clean method to add paths
    replaceSelectionWithPaths, // Clean method to replace paths
    findRelevantFiles: findRelevantFilesCallback,
    refreshFiles,
    setFindFilesMode,
    undoSelection: fileSelectionManager.undoSelection,
    redoSelection: fileSelectionManager.redoSelection,

    // Session state extraction
    getFileStateForSession,

    // Flush operations
    flushFileStateSaves,
    flushPendingOperations: fileSelectionManager.flushPendingOperations
  });

  // Return a stable reference that always has up-to-date values
  return stableContextValue.current;
}