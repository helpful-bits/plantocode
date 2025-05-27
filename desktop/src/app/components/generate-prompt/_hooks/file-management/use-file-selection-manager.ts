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

  // Handle session transitions with refined logic
  useEffect(() => {
    const sessionChanged = prevSessionIdRef.current !== activeSessionId;
    const transitionEnded = prevIsTransitioningRef.current && !isTransitioningSession;

    if (transitionEnded && sessionChanged && prevSessionIdRef.current !== null) {
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
  const prevIncludedPathsLengthRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Use the current prop value instead of derived state to be consistent with the source of truth
    const currentIncludedFilesLength = currentIncludedFiles.length;

    // Only proceed if we have a project loaded (rawFilesMap has content)
    if (Object.keys(rawFilesMap).length === 0) {
      prevIncludedPathsLengthRef.current = currentIncludedFilesLength;
      return;
    }

    // Auto-toggle "show only selected" to false when selections become empty
    // Only if "show only selected" is currently true to avoid unnecessary state changes
    if (showOnlySelected) {
      // Case 1: The count became zero (i.e., it was > 0 before and now is 0)
      const countJustBecameZero = currentIncludedFilesLength === 0 &&
        prevIncludedPathsLengthRef.current !== undefined &&
        prevIncludedPathsLengthRef.current > 0;

      // Case 2: No selected files and not transitioning (prevents confusing empty UI)
      const hasNoSelectionsAndNotTransitioning = currentIncludedFilesLength === 0 && !isTransitioningSession;

      if (countJustBecameZero || hasNoSelectionsAndNotTransitioning) {
        setShowOnlySelectedInternal(false);
      }
    }

    // Update previous length for the next run
    prevIncludedPathsLengthRef.current = currentIncludedFilesLength;
  }, [
    currentIncludedFiles.length,
    rawFilesMap,
    isTransitioningSession,
    showOnlySelected,
  ]);

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
      fileSelectionCore.managedFilesMap,
      searchTerm,
      showOnlySelected,
      externalPathHandler.externalPathWarnings,
      searchSelectedFilesOnly,
      fileSelectionCore.includedPaths,
      fileSelectionCore.excludedPaths,
      setSearchTerm,
      setShowOnlySelectedInternal,
      externalPathHandler.clearExternalPathWarnings,
      fileSelectionCore.toggleFileSelection,
      fileSelectionCore.toggleFileExclusion,
      toggleSearchSelectedFilesOnly,
      fileSelectionCore.handleBulkToggle,
      externalPathHandler.applySelectionsFromPaths,
      externalPathHandler.replaceAllSelectionsWithPaths,
      fileSelectionHistory.undoSelection,
      fileSelectionHistory.redoSelection,
      fileSelectionHistory.canUndo,
      fileSelectionHistory.canRedo,
      flushPendingOperations,
      reset,
    ]
  );
}
