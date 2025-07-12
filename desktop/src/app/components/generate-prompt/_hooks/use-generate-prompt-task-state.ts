"use client";

import { useCallback, useMemo } from "react";

import { type TaskDescriptionHandle } from "../_components/task-description";
import { useTaskDescriptionState } from "./use-task-description-state";
import { 
  useSessionStateContext, 
  useSessionActionsContext 
} from "@/contexts/session";

export interface UseGeneratePromptTaskStateProps {
  taskDescriptionRef: React.RefObject<TaskDescriptionHandle | null>;
}

/**
 * Hook that manages task-specific state for the generate prompt feature.
 * This includes task refinement functionality,
 * getting its taskDescription state from SessionContext.
 */
export function useGeneratePromptTaskState({
  taskDescriptionRef
}: UseGeneratePromptTaskStateProps) {
  // Get session context directly
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();
  
  // Handle user interaction that modifies session
  const handleInteraction = useCallback(() => {
    sessionActions.setSessionModified(true);
  }, [sessionActions.setSessionModified]);
  
  // Use local task description setter to avoid immediate session updates
  
  // Initialize task description state for UI-specific concerns
  const {
    isRefiningTask,
    isWebRefiningTask: isDoingWebSearch,
    handleRefineTask,
    handleWebRefineTask: handleWebSearch,
    cancelWebSearch,
    canUndo,
    canRedo,
    undo,
    redo,
    webSearchResults,
    applyWebSearchResults,
  } = useTaskDescriptionState({
    activeSessionId: sessionState.currentSession?.id || null,
    taskDescriptionRef,
    onInteraction: handleInteraction,
  });



  // Create a reset function for task state
  const resetTaskState = useCallback(() => {
    // Reset task description in the session
    sessionActions.updateCurrentSessionFields({ taskDescription: "" });
    // Task state reset completed
  }, [sessionActions.updateCurrentSessionFields]);

  // Create a memoized value to prevent unnecessary renders
  return useMemo(
    () => ({
      // Task Description State (session state only)
      taskDescriptionRef,
      isRefiningTask,
      isDoingWebSearch,
      handleRefineTask,
      handleWebSearch,
      cancelWebSearch,
      canUndo,
      canRedo,
      undo,
      redo,
      webSearchResults,
      applyWebSearchResults,

      // Combined Actions
      resetTaskState,
    }),
    [
      // taskDescriptionRef is a ref - stable
      isRefiningTask,
      isDoingWebSearch,
      handleRefineTask, // memoized with useCallback
      handleWebSearch, // memoized with useCallback
      cancelWebSearch, // memoized with useCallback
      canUndo,
      canRedo,
      undo, // memoized with useCallback
      redo, // memoized with useCallback
      webSearchResults,
      applyWebSearchResults, // memoized with useCallback
      resetTaskState, // memoized with useCallback above
    ]
  );
}
