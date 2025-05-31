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
 * This includes guidance generation and text improvement functionality,
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
  
  const setTaskDescription = useCallback((description: string) => {
    sessionActions.updateCurrentSessionFields({ taskDescription: description });
    handleInteraction();
  }, [sessionActions.updateCurrentSessionFields, handleInteraction]);
  
  // Initialize task description state for UI-specific concerns
  const {
    isImprovingText,
    textImprovementJobId,
    handleImproveSelection,
  } = useTaskDescriptionState({
    activeSessionId: sessionState.activeSessionId,
    taskDescriptionRef,
    onInteraction: handleInteraction,
  });

  // Initialize guidance generation state
  const {
    isGeneratingGuidance,
    handleGenerateGuidance: baseHandleGenerateGuidance,
  } = useGuidanceGeneration({
    projectDirectory: projectDirectory || "",
    onGuidanceGenerated: setTaskDescription,
    onInteraction: handleInteraction,
  });

  // Wrap the guidance generation handler to call handleInteraction
  const handleGenerateGuidance = useCallback(
    async (selectedPaths?: string[]) => {
      handleInteraction();
      return baseHandleGenerateGuidance(selectedPaths);
    },
    [baseHandleGenerateGuidance, handleInteraction]
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
      // Task Description State (reference only - state is managed by coreState)
      taskDescriptionRef,
      isImprovingText,
      textImprovementJobId,
      handleImproveSelection,

      // Guidance Generation State
      isGeneratingGuidance,
      handleGenerateGuidance,

      // Combined Actions
      resetTaskState,
    }),
    [
      // taskDescriptionRef is a ref - stable
      isImprovingText,
      textImprovementJobId,
      handleImproveSelection, // memoized with useCallback
      isGeneratingGuidance,
      handleGenerateGuidance, // memoized with useCallback
      resetTaskState, // memoized with useCallback above
    ]
  );
}
