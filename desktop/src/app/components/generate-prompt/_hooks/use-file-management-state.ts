"use client";

import { useCallback, useEffect, useState, useMemo } from "react";

import { useSessionStateContext } from "@/contexts/session";
import { useProject } from "@/contexts/project-context";

import { type FileManagementContextValue } from "../_contexts/file-management-context";

import { useFileSelectionManager } from "./file-management/use-file-selection-manager";
import { useFileSessionSync } from "./file-management/use-file-session-sync";
import {
  useProjectFileList,
  type FileInfo,
} from "./file-management/use-project-file-list";
import { clearManagedFilesMapCache } from "./file-management/_utils/managed-files-map-utils";

export function useFileManagementState(): FileManagementContextValue {
  const { projectDirectory } = useProject();
  const { activeSessionId, isSessionLoading: isTransitioningSession } = useSessionStateContext();

  const [filterMode, setFilterModeState] = useState<"all" | "selected">("all");
  const [findFilesMode, setFindFilesMode] = useState<"replace" | "extend">("extend");
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

  const projectFileListResult = useProjectFileList(projectDirectory, activeSessionId);
  const rawFilesMap = projectFileListResult.rawFilesMap;
  const isLoadingFiles = projectFileListResult.isLoading;
  const isInitialized = projectFileListResult.isInitialized;
  const fileLoadError = projectFileListResult.error;
  const originalRefreshFiles = projectFileListResult.refreshFiles;

  const refreshFiles = useCallback(async (): Promise<void> => {
    // Ensure originalRefreshFiles is called to maintain proper state
    await originalRefreshFiles();
  }, [originalRefreshFiles]);

  // Simple fix: just pass the current session arrays directly without refs or atomic updates
  const onUpdateIncludedFiles = useCallback((paths: string[]) => {
    syncFileSelectionsToSession(paths, sessionForceExcludedFiles);
  }, [syncFileSelectionsToSession, sessionForceExcludedFiles]);

  const onUpdateExcludedFiles = useCallback((paths: string[]) => {
    syncFileSelectionsToSession(sessionIncludedFiles, paths);
  }, [syncFileSelectionsToSession, sessionIncludedFiles]);

  const fileSelectionManager = useFileSelectionManager({
    rawFilesMap,
    currentIncludedFiles: sessionIncludedFiles,
    currentExcludedFiles: sessionForceExcludedFiles,
    currentSearchTerm: searchTerm,
    currentSearchSelectedFilesOnly: searchSelectedFilesOnly,
    onUpdateIncludedFiles,
    onUpdateExcludedFiles,
    onUpdateSearchTerm: updateSearchTerm,
    onUpdateSearchSelectedOnly: updateSearchSelectedOnly,
    isTransitioningSession,
    activeSessionId,
  });

  // Clear cache when project directory changes for performance
  useEffect(() => {
    clearManagedFilesMapCache();
  }, [projectDirectory]);

  // Auto-initialize file list when project and session are ready
  useEffect(() => {
    if (projectDirectory && activeSessionId && !isInitialized && !isLoadingFiles) {
      refreshFiles().catch(() => {
        // Error handled by refreshFiles
      });
    }
  }, [projectDirectory, activeSessionId, isInitialized, isLoadingFiles, refreshFiles]);



  const findRelevantFilesCallback = useCallback(async (): Promise<void> => {
    // This will be handled by components that use useRustManagedFileFinderWorkflow directly
    console.warn("findRelevantFiles called but workflow logic has been moved to useRustManagedFileFinderWorkflow");
  }, []);

  const adaptedHandleBulkToggle = useCallback(
    (files: FileInfo[], include: boolean) => {
      void fileSelectionManager.handleBulkToggle(include, files);
    },
    [fileSelectionManager]
  );

  const handleFilterModeChange = useCallback(
    (mode: "all" | "selected") => {
      setFilterModeState(mode);
    },
    []
  );


  const contextValue = useMemo(
    () => ({
      managedFilesMap: fileSelectionManager.managedFilesMap,
      isLoadingFiles,
      isInitialized,
      fileLoadError,
      refreshFiles,
      searchTerm,
      filterMode,
      externalPathWarnings: fileSelectionManager.externalPathWarnings,
      includedPaths: fileSelectionManager.includedPaths,
      excludedPaths: fileSelectionManager.excludedPaths,
      searchSelectedFilesOnly,
      canUndo: fileSelectionManager.canUndo,
      canRedo: fileSelectionManager.canRedo,
      findFilesMode,


      // Actions
      setSearchTerm: updateSearchTerm,
      setFilterMode: handleFilterModeChange,
      toggleFileSelection: fileSelectionManager.toggleFileSelection,
      toggleFileExclusion: fileSelectionManager.toggleFileExclusion,
      toggleSearchSelectedFilesOnly: updateSearchSelectedOnly,
      handleBulkToggle: adaptedHandleBulkToggle,
      undoSelection: fileSelectionManager.undoSelection,
      redoSelection: fileSelectionManager.redoSelection,

      findRelevantFiles: findRelevantFilesCallback,
      setFindFilesMode,

      getFileStateForSession,
      flushFileStateSaves,
      flushPendingOperations: fileSelectionManager.flushPendingOperations,
    }),
    [
      fileSelectionManager.managedFilesMap,
      isLoadingFiles,
      isInitialized,
      fileLoadError,
      refreshFiles,
      searchTerm,
      filterMode,
      searchSelectedFilesOnly,
      findFilesMode,
      fileSelectionManager.externalPathWarnings,
      fileSelectionManager.includedPaths,
      fileSelectionManager.excludedPaths,
      fileSelectionManager.canUndo,
      fileSelectionManager.canRedo,
      updateSearchTerm,
      handleFilterModeChange,
      fileSelectionManager.toggleFileSelection,
      fileSelectionManager.toggleFileExclusion,
      updateSearchSelectedOnly,
      adaptedHandleBulkToggle,
      fileSelectionManager.undoSelection,
      fileSelectionManager.redoSelection,
      findRelevantFilesCallback,
      setFindFilesMode,
      getFileStateForSession,
      flushFileStateSaves,
      fileSelectionManager.flushPendingOperations,
    ]
  );

  return contextValue;
}
