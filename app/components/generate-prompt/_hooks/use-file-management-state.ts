"use client";

import { useRef, useCallback, useEffect } from "react";
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
  const searchTerm = currentSession?.searchTerm || '';
  const searchSelectedFilesOnly = currentSession?.searchSelectedFilesOnly || false;
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
    // Use setTimeout to defer the state update to the next microtask
    setTimeout(() => {
      updateCurrentSessionFields({ searchTerm: term });
      setSessionModified(true);
    }, 0);
  }, [updateCurrentSessionFields, setSessionModified]);

  const handleUpdateSearchSelectedOnly = useCallback((value: boolean) => {
    // Use setTimeout to defer the state update to the next microtask
    setTimeout(() => {
      updateCurrentSessionFields({ searchSelectedFilesOnly: value });
      setSessionModified(true);
    }, 0);
  }, [updateCurrentSessionFields, setSessionModified]);

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

  const handlePathsFoundByAI = useCallback((paths: string[]) => {
    if (paths.length > 0) {

      // Replace all current selections with the new paths
      replaceAllSelectionsWithPaths(paths);

      // Set showOnlySelected to true to show only the selected files
      setShowOnlySelected(true);
    } else {
    }
  }, [replaceAllSelectionsWithPaths, setShowOnlySelected]);

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

  // Use useStableRef to create a stable context object that automatically updates when its dependencies change
  const stableContextValue = useStableRef({
    // State
    managedFilesMap,
    searchTerm,
    showOnlySelected,
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

    // Flush operations
    flushFileStateSaves,
    flushPendingOperations: fileSelectionManager.flushPendingOperations
  });

  // Return a stable reference that always has up-to-date values
  return stableContextValue.current;
}