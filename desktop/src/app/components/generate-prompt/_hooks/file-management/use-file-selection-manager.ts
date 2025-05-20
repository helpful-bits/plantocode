"use client";

import { useState, useCallback, useEffect, useRef } from "react";

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
  const fileSelectionCore = useFileSelectionCore({
    rawFilesMap,
    currentIncludedFiles,
    currentExcludedFiles,
    onUpdateIncludedFiles,
    onUpdateExcludedFiles,
  });

  const fileSelectionHistory = useFileSelectionHistory({
    currentIncludedFiles,
    currentExcludedFiles,
    onUpdateIncludedFiles,
    onUpdateExcludedFiles,
  });

  const externalPathHandler = useExternalPathHandler({
    managedFilesMap: fileSelectionCore.managedFilesMap,
    currentIncludedFiles,
    currentExcludedFiles,
    onUpdateIncludedFiles,
    onUpdateExcludedFiles,
    pushHistory: fileSelectionHistory.pushHistory,
  });

  // Track session changes
  useEffect(() => {
    const sessionChanged = prevSessionIdRef.current !== activeSessionId;
    const transitionStateChanged =
      prevIsTransitioningRef.current !== isTransitioningSession;

    if (sessionChanged) {
      prevSessionIdRef.current = activeSessionId;
    }

    if (transitionStateChanged) {
      prevIsTransitioningRef.current = isTransitioningSession;
    }
  }, [activeSessionId, isTransitioningSession]);

  // Reset all state when session changes
  const reset = useCallback(() => {
    fileSelectionCore.reset();
    fileSelectionHistory.reset();
    externalPathHandler.reset();
    setShowOnlySelectedInternal(false);
  }, [fileSelectionCore, fileSelectionHistory, externalPathHandler]);

  // Handle session transitions
  useEffect(() => {
    // Skip resets during transitions
    if (isTransitioningSession) {
      return;
    }

    // Only reset after the transition is complete (activeSessionId changed AND transition is done)
    if (
      activeSessionId !== prevSessionIdRef.current &&
      prevSessionIdRef.current !== null &&
      !isTransitioningSession
    ) {
      reset();
    }

    // Update the ref for next comparison, but only when not transitioning
    if (!isTransitioningSession) {
      prevSessionIdRef.current = activeSessionId;
    }
  }, [activeSessionId, reset, isTransitioningSession]);

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
  const prevIncludedPathsLengthRef = useRef<number | undefined>();

  useEffect(() => {
    // Use the current prop value instead of derived state to be consistent with the source of truth
    const currentIncludedFilesLength = currentIncludedFiles.length;

    // Only act if "show only selected" is currently active
    // and there are files in the project (rawFilesMap indicates loaded project files)
    if (showOnlySelected && Object.keys(rawFilesMap).length > 0) {
      // Check if the count *became* zero (i.e., it was > 0 before and now is 0)
      if (
        currentIncludedFilesLength === 0 &&
        prevIncludedPathsLengthRef.current !== undefined &&
        prevIncludedPathsLengthRef.current > 0
      ) {
        setShowOnlySelectedInternal(false);
      }
    }

    // Handle the case where a session with no selected files is loaded
    // but "Show Only Selected" is somehow still active - preventing a confusing empty UI
    if (
      showOnlySelected &&
      currentIncludedFilesLength === 0 &&
      Object.keys(rawFilesMap).length > 0 &&
      !isTransitioningSession
    ) {
      // If we have files in rawFilesMap but no selections AND show only selected,
      // automatically switch to "All Files" view
      setShowOnlySelectedInternal(false);
    }

    // Update previous length for the next run
    prevIncludedPathsLengthRef.current = currentIncludedFilesLength;
  }, [
    currentIncludedFiles.length,
    showOnlySelected,
    rawFilesMap,
    isTransitioningSession,
  ]);

  // Return a comprehensive API that maintains the same interface as the original hook
  return {
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

    // History operations
    undoSelection: fileSelectionHistory.undoSelection,
    redoSelection: fileSelectionHistory.redoSelection,
    canUndo: fileSelectionHistory.canUndo,
    canRedo: fileSelectionHistory.canRedo,

    // Cleanup
    flushPendingOperations: useCallback(() => {}, []), // Simplified placeholder
    reset,
  };
}
