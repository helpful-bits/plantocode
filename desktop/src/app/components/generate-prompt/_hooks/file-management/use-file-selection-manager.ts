"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import { useExternalPathHandler } from "./use-external-path-handler";
import { useFileSelectionCore } from "./use-file-selection-core";
import { useFileSelectionHistory } from "./use-file-selection-history";
import { type FilesMap } from "./use-project-file-list";

interface UseFileSelectionManagerProps {
  rawFilesMap: FilesMap;
  currentIncludedFiles: string[];
  currentExcludedFiles: string[];
  currentSearchTerm: string;
  currentSearchSelectedFilesOnly: boolean;
  onUpdateIncludedFiles: (paths: string[]) => void;
  onUpdateExcludedFiles: (paths: string[]) => void;
  onUpdateSearchTerm: (term: string) => void;
  onUpdateSearchSelectedOnly: (value: boolean) => void;
  isTransitioningSession?: boolean;
  activeSessionId?: string | null;
}

/**
 * Main hook to manage file selections, search state, and history
 * Acts as the single source of truth for file selection state
 */
export function useFileSelectionManager({
  rawFilesMap,
  currentIncludedFiles,
  currentExcludedFiles,
  currentSearchTerm,
  currentSearchSelectedFilesOnly,
  onUpdateIncludedFiles,
  onUpdateExcludedFiles,
  onUpdateSearchTerm,
  onUpdateSearchSelectedOnly,
  isTransitioningSession = false,
  activeSessionId = null,
}: UseFileSelectionManagerProps) {
  // UI state
  const [showOnlySelected, setShowOnlySelectedInternal] =
    useState<boolean>(false);

  // Session tracking refs
  const prevIsTransitioningRef = useRef(isTransitioningSession);
  const prevSessionIdRef = useRef<string | null>(activeSessionId);

  // Use modular hooks for core functionality
  const fileSelectionHistory = useFileSelectionHistory({
    currentIncludedFiles,
    currentExcludedFiles,
    onUpdateIncludedFiles,
    onUpdateExcludedFiles,
  });

  const fileSelectionCore = useFileSelectionCore({
    rawFilesMap,
    currentIncludedFiles,
    currentExcludedFiles,
    onUpdateIncludedFiles,
    onUpdateExcludedFiles,
    pushHistory: fileSelectionHistory.pushHistory,
  });

  const externalPathHandler = useExternalPathHandler({
    managedFilesMap: fileSelectionCore.managedFilesMap,
    currentIncludedFiles,
    currentExcludedFiles,
    onUpdateIncludedFiles,
    onUpdateExcludedFiles,
    pushHistory: fileSelectionHistory.pushHistory,
  });

  // Flush pending operations function
  const flushPendingOperations = useCallback(() => {
    fileSelectionHistory.pushHistory(
      fileSelectionCore.includedPaths,
      fileSelectionCore.excludedPaths
    );
  }, [
    fileSelectionHistory.pushHistory,
    fileSelectionCore.includedPaths,
    fileSelectionCore.excludedPaths,
  ]);

  // Reset all state when session changes
  const reset = useCallback(() => {
    fileSelectionCore.reset();
    fileSelectionHistory.reset();
    externalPathHandler.reset();
    setShowOnlySelectedInternal(false);
  }, [fileSelectionCore, fileSelectionHistory, externalPathHandler]);

  // Handle session transitions with robust logic to prevent stale file selection state
  useEffect(() => {
    const sessionChanged = prevSessionIdRef.current !== activeSessionId;
    const transitionEnded = prevIsTransitioningRef.current && !isTransitioningSession;
    const projectDirectoryChanged = !activeSessionId; // No session means project directory change
    
    // Reset file selection state robustly to handle all scenarios:
    // 1. Session transition completed AND session actually changed AND we had a previous session (new session load)
    // 2. Project directory changed (activeSessionId becomes null) - project change
    // 3. Loading a different session (sessionChanged is true and we're not transitioning) - direct session switch
    const shouldReset = (
      (transitionEnded && sessionChanged && prevSessionIdRef.current !== null) ||
      (projectDirectoryChanged && prevSessionIdRef.current !== null) ||
      (sessionChanged && !isTransitioningSession && activeSessionId !== null)
    );

    if (shouldReset) {
      reset();
    }

    // Update refs for next cycle
    prevSessionIdRef.current = activeSessionId;
    prevIsTransitioningRef.current = isTransitioningSession;

  }, [activeSessionId, isTransitioningSession, reset]);

  // Pass through setters to communicate with session
  const searchTerm = currentSearchTerm;
  const searchSelectedFilesOnly = currentSearchSelectedFilesOnly;

  const setSearchTerm = useCallback(
    (value: string) => {
      onUpdateSearchTerm(value);
    },
    [onUpdateSearchTerm]
  );

  const toggleSearchSelectedFilesOnly = useCallback(
    (value?: boolean) => {
      const newValue =
        typeof value === "boolean" ? value : !searchSelectedFilesOnly;
      onUpdateSearchSelectedOnly(newValue);
    },
    [searchSelectedFilesOnly, onUpdateSearchSelectedOnly]
  );

  // Auto-toggle "Show Only Selected" to "All Files" when selection becomes empty
  // Simplified logic: if showOnlySelected is true and currentIncludedFiles.length becomes 0, set showOnlySelected to false
  useEffect(() => {
    if (showOnlySelected && currentIncludedFiles.length === 0 && !isTransitioningSession) {
      setShowOnlySelectedInternal(false);
    }
  }, [currentIncludedFiles.length, showOnlySelected, isTransitioningSession]);

  // Return a comprehensive API that maintains the same interface as the original hook
  return useMemo(
    () => ({
      // State - the authoritative source of truth for file selection
      managedFilesMap: fileSelectionCore.managedFilesMap,
      searchTerm,
      showOnlySelected,
      externalPathWarnings: externalPathHandler.externalPathWarnings,
      searchSelectedFilesOnly,
      includedPaths: fileSelectionCore.includedPaths,
      excludedPaths: fileSelectionCore.excludedPaths,

      // Setters
      setSearchTerm,
      setShowOnlySelected: setShowOnlySelectedInternal,
      setExternalPathWarnings: externalPathHandler.clearExternalPathWarnings,

      // Core selection actions
      toggleFileSelection: fileSelectionCore.toggleFileSelection,
      toggleFileExclusion: fileSelectionCore.toggleFileExclusion,
      toggleSearchSelectedFilesOnly,
      handleBulkToggle: fileSelectionCore.handleBulkToggle,

      // External path handling
      applySelectionsFromPaths: externalPathHandler.applySelectionsFromPaths,
      replaceAllSelectionsWithPaths:
        externalPathHandler.replaceAllSelectionsWithPaths,
      
      // Workflow integration aliases
      addPathsToSelection: externalPathHandler.applySelectionsFromPaths,
      replaceSelectionWithPaths: externalPathHandler.replaceAllSelectionsWithPaths,

      // History operations
      undoSelection: fileSelectionHistory.undoSelection,
      redoSelection: fileSelectionHistory.redoSelection,
      canUndo: fileSelectionHistory.canUndo,
      canRedo: fileSelectionHistory.canRedo,

      // Cleanup
      flushPendingOperations,
      reset,
    }),
    [
      // Core state objects (these come from sub-hooks that already manage their own memoization)
      fileSelectionCore,
      externalPathHandler,
      fileSelectionHistory,
      
      // Primitive state values
      searchTerm,
      showOnlySelected,
      searchSelectedFilesOnly,
      
      // Stable callbacks (already memoized)
      setSearchTerm,
      toggleSearchSelectedFilesOnly,
      flushPendingOperations,
      reset,
    ]
  );
}
