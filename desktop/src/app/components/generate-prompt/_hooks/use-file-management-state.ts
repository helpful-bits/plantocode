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
import { useRustManagedFileFinderWorkflow } from "./file-management/workflow/useRustManagedFileFinderWorkflow";

export function useFileManagementState(): FileManagementContextValue {
  const { projectDirectory } = useProject();
  const { activeSessionId, isSessionLoading: isTransitioningSession, currentSession } = useSessionStateContext();
  const taskDescription = currentSession?.taskDescription || "";

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
    await originalRefreshFiles();
  }, [originalRefreshFiles]);

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

  const addPathsToSelection = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      fileSelectionManager.applySelectionsFromPaths(paths);
      fileSelectionManager.setShowOnlySelected(true);
    },
    [fileSelectionManager]
  );

  const replaceSelectionWithPaths = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      fileSelectionManager.replaceAllSelectionsWithPaths(paths);
      fileSelectionManager.setShowOnlySelected(true);
    },
    [fileSelectionManager]
  );

  const fileFinderWorkflow = useRustManagedFileFinderWorkflow({
    activeSessionId: activeSessionId || "",
    projectDirectory: projectDirectory || "",
    taskDescription,
    excludedPaths: fileSelectionManager.excludedPaths,
    replaceSelection: replaceSelectionWithPaths,
    extendSelection: addPathsToSelection,
    findFilesMode,
    timeout: 120000,
  });

  const findRelevantFilesCallback = useCallback(async (): Promise<void> => {
    if (!taskDescription.trim() || fileFinderWorkflow.isWorkflowRunning || !activeSessionId || !projectDirectory) {
      return;
    }

    try {
      await fileFinderWorkflow.executeWorkflow();
    } catch (error) {
      console.error("[FileManagementState] Error finding relevant files:", error);
    }
  }, [taskDescription, fileFinderWorkflow, activeSessionId, projectDirectory]);

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

      fileContentsMap: {},

      isFindingFiles: Boolean(fileFinderWorkflow.isWorkflowRunning),
      currentWorkflowStage: fileFinderWorkflow.currentStage,
      currentStageMessage: fileFinderWorkflow.stageMessage,
      workflowError: fileFinderWorkflow.workflowError,
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
      fileFinderWorkflow.isWorkflowRunning,
      fileFinderWorkflow.currentStage,
      fileFinderWorkflow.stageMessage,
      fileFinderWorkflow.workflowError,
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
