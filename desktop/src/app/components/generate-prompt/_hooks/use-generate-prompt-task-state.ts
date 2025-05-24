"use client";

import { useCallback, useMemo } from "react";

import { type TaskDescriptionHandle } from "../_components/task-description";
import { useGuidanceGeneration } from "./use-guidance-generation";
import { useTaskDescriptionState } from "./use-task-description-state";
import { 
  useSessionStateContext, 
  useSessionActionsContext 
} from "@/contexts/session";

export interface UseGeneratePromptTaskStateProps {
  handleInteraction?: () => void;
  taskDescriptionRef: React.RefObject<TaskDescriptionHandle | null>;
}

/**
 * Hook that manages task-specific state for the generate prompt feature.
 * This includes guidance generation and text improvement functionality,
 * getting its taskDescription state from SessionContext.
 */
export function useGeneratePromptTaskState({
  handleInteraction,
  taskDescriptionRef
}: UseGeneratePromptTaskStateProps) {
  // Get task description from SessionContext
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();
  
  const taskDescription = sessionState.currentSession?.taskDescription || "";
  
  const setTaskDescription = useCallback((description: string) => {
    sessionActions.updateCurrentSessionFields({ taskDescription: description });
    if (handleInteraction) {
      handleInteraction();
    }
  }, [sessionActions, handleInteraction]);
  
  // Initialize task description state for UI-specific concerns
  const {
    isImprovingText,
    textImprovementJobId,
    handleImproveSelection,
  } = useTaskDescriptionState({
    taskDescription,
    activeSessionId: sessionState.activeSessionId,
    taskDescriptionRef,
    onInteraction: handleInteraction,
  });

  // Initialize guidance generation state
  const {
    isGeneratingGuidance,
    handleGenerateGuidance: baseHandleGenerateGuidance,
  } = useGuidanceGeneration({
    projectDirectory: sessionState.currentSession?.projectDirectory || null,
    taskDescription,
    onGuidanceGenerated: setTaskDescription,
    onInteraction: handleInteraction || (() => {}),
  });

  // Wrap the guidance generation handler to call handleInteraction
  const handleGenerateGuidance = useCallback(
    async (selectedPaths: string[]) => {
      if (handleInteraction) {
        handleInteraction();
      }
      return baseHandleGenerateGuidance(selectedPaths);
    },
    [baseHandleGenerateGuidance, handleInteraction]
  );

  // Create a reset function for task state
  const resetTaskState = useCallback(() => {
    // Reset task description in the session
    sessionActions.updateCurrentSessionFields({ taskDescription: "" });
    // No explicit reset for guidance generation as its state is ephemeral
  }, [sessionActions]);

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
      taskDescriptionRef,
      resetTaskState,
      isImprovingText,
      textImprovementJobId,
      handleImproveSelection,
      isGeneratingGuidance,
      handleGenerateGuidance,
    ]
  );
}
