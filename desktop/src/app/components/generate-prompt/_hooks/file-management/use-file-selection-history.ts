"use client";

import { useState, useCallback, useMemo } from "react";

// Define a selection history item type
interface SelectionHistoryItem {
  included: string[];
  excluded: string[];
}

interface UseFileSelectionHistoryProps {
  currentIncludedFiles: string[];
  currentExcludedFiles: string[];
  onUpdateIncludedFiles: (paths: string[]) => void;
  onUpdateExcludedFiles: (paths: string[]) => void;
}

/**
 * Hook to manage file selection history (undo/redo)
 */
export function useFileSelectionHistory({
  currentIncludedFiles,
  currentExcludedFiles,
  onUpdateIncludedFiles,
  onUpdateExcludedFiles,
}: UseFileSelectionHistoryProps) {
  const [pastSelections, setPastSelections] = useState<SelectionHistoryItem[]>(
    []
  );
  const [futureSelections, setFutureSelections] = useState<
    SelectionHistoryItem[]
  >([]);

  // Helper function to push current selection state to history
  const pushHistory = useCallback(
    (currentIncluded: string[], currentExcluded: string[]) => {
      // Only push to history if there are changes to track
      setPastSelections((prev: SelectionHistoryItem[]) => {
        // Limit history size to 20 entries for performance
        const updatedHistory = [
          ...prev,
          { included: [...currentIncluded], excluded: [...currentExcluded] },
        ];
        if (updatedHistory.length > 20) {
          return updatedHistory.slice(-20);
        }
        return updatedHistory;
      });

      // Clear future selections when a new change is made
      setFutureSelections([]);
    },
    []
  );

  // Implement undo selection function
  const undoSelection = useCallback(() => {
    if (pastSelections.length === 0) {
      return; // Nothing to undo
    }

    // Get a copy of the current state for redoing later
    const currentState = {
      included: [...currentIncludedFiles],
      excluded: [...currentExcludedFiles],
    };

    // Pop the last state from history
    const prevSelections = [...pastSelections];
    const prevState = prevSelections.pop();

    // Save current state to future for redo
    setFutureSelections((prev: SelectionHistoryItem[]) => [currentState, ...prev]);

    // Update history
    setPastSelections(prevSelections);

    // Apply the previous state
    if (prevState) {
      onUpdateIncludedFiles(prevState.included);
      onUpdateExcludedFiles(prevState.excluded);
    }
  }, [
    pastSelections,
    currentIncludedFiles,
    currentExcludedFiles,
    onUpdateIncludedFiles,
    onUpdateExcludedFiles,
  ]);

  // Implement redo selection function
  const redoSelection = useCallback(() => {
    if (futureSelections.length === 0) {
      return; // Nothing to redo
    }

    // Get a copy of the current state for undoing later
    const currentState = {
      included: [...currentIncludedFiles],
      excluded: [...currentExcludedFiles],
    };

    // Pop the next state from future
    const nextSelections = [...futureSelections];
    const nextState = nextSelections.shift();

    // Save current state to history for undo
    setPastSelections((prev: SelectionHistoryItem[]) => [...prev, currentState]);

    // Update future history
    setFutureSelections(nextSelections);

    // Apply the next state
    if (nextState) {
      onUpdateIncludedFiles(nextState.included);
      onUpdateExcludedFiles(nextState.excluded);
    }
  }, [
    futureSelections,
    currentIncludedFiles,
    currentExcludedFiles,
    onUpdateIncludedFiles,
    onUpdateExcludedFiles,
  ]);

  // Calculate if undo/redo are available
  const canUndo = pastSelections.length > 0;
  const canRedo = futureSelections.length > 0;

  const reset = useCallback(() => {
    setPastSelections([]);
    setFutureSelections([]);
  }, []);

  return useMemo(
    () => ({
      pushHistory,
      undoSelection,
      redoSelection,
      canUndo,
      canRedo,
      reset,
    }),
    [pushHistory, undoSelection, redoSelection, canUndo, canRedo, reset]
  );
}
