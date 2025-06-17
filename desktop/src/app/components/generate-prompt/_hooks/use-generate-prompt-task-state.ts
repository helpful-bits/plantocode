"use client";

import { useCallback, useMemo } from "react";

import { type TaskDescriptionHandle } from "../_components/task-description";
import { useGuidanceGeneration } from "./use-guidance-generation";
import { useTaskDescriptionState } from "./use-task-description-state";
import { 
  useSessionStateContext, 
  useSessionActionsContext 
} from "@/contexts/session";
import { useProject } from "@/contexts/project-context";

export interface UseGeneratePromptTaskStateProps {
  taskDescriptionRef: React.RefObject<TaskDescriptionHandle | null>;
}

/**
 * Hook that manages task-specific state for the generate prompt feature.
 * This includes guidance generation and task refinement functionality,
 * getting its taskDescription state from SessionContext.
 */
export function useGeneratePromptTaskState({
  taskDescriptionRef
}: UseGeneratePromptTaskStateProps) {
  // Get session and project context directly
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();
  const { projectDirectory } = useProject();
  
  // Handle user interaction that modifies session
  const handleInteraction = useCallback(() => {
    sessionActions.setSessionModified(true);
  }, [sessionActions.setSessionModified]);
  
  // Use local task description setter to avoid immediate session updates
  
  // Initialize task description state for UI-specific concerns
  const {
    isRefiningTask,
    handleRefineTask,
    canUndo,
    canRedo,
    undo,
    redo,
    saveToHistory,
  } = useTaskDescriptionState({
    activeSessionId: sessionState.currentSession?.id || null,
    taskDescriptionRef,
    onInteraction: handleInteraction,
  });

  // Initialize guidance generation state
  const {
    isGeneratingGuidance,
    handleGenerateGuidance: baseHandleGenerateGuidance,
  } = useGuidanceGeneration({
    projectDirectory: projectDirectory || "",
    onGuidanceGenerated: (guidance: string) => {
      // Note: History saving will be handled by the debounced effect in useTaskDescriptionState
      // since the sessionTaskDescription will change, triggering the history save mechanism
      sessionActions.updateCurrentSessionFields({ taskDescription: guidance });
      sessionActions.setSessionModified(true);
      handleInteraction();
    },
    onInteraction: handleInteraction,
  });

  // Wrap the guidance generation handler to save history and call handleInteraction
  const handleGenerateGuidance = useCallback(
    async (selectedPaths?: string[]) => {
      // Save current description to history before generating guidance
      // This ensures we can undo guidance generation
      const currentDescription = sessionState.currentSession?.taskDescription || "";
      if (currentDescription) {
        saveToHistory(currentDescription);
      }
      handleInteraction();
      return baseHandleGenerateGuidance(selectedPaths);
    },
    [baseHandleGenerateGuidance, handleInteraction, sessionState.currentSession?.taskDescription, saveToHistory]
  );

  // Create a reset function for task state
  const resetTaskState = useCallback(() => {
    // Reset task description in the session
    sessionActions.updateCurrentSessionFields({ taskDescription: "" });
    // No explicit reset for guidance generation as its state is ephemeral
  }, [sessionActions.updateCurrentSessionFields]);

  // Create a memoized value to prevent unnecessary renders
  return useMemo(
    () => ({
      // Task Description State (session state only)
      taskDescriptionRef,
      isRefiningTask,
      handleRefineTask,
      canUndo,
      canRedo,
      undo,
      redo,

      // Guidance Generation State
      isGeneratingGuidance,
      handleGenerateGuidance,

      // Combined Actions
      resetTaskState,
    }),
    [
      // taskDescriptionRef is a ref - stable
      isRefiningTask,
      handleRefineTask, // memoized with useCallback
      canUndo,
      canRedo,
      undo, // memoized with useCallback
      redo, // memoized with useCallback
      isGeneratingGuidance,
      handleGenerateGuidance, // memoized with useCallback
      resetTaskState, // memoized with useCallback above
    ]
  );
}
