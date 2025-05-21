"use client";

import { useCallback, useMemo } from "react";

import { type TaskDescriptionHandle } from "../_components/task-description";
import { useGuidanceGeneration } from "./use-guidance-generation";
import { useTaskDescriptionState } from "./use-task-description-state";

export interface UseGeneratePromptTaskStateProps {
  taskDescription: string;
  setTaskDescription: (description: string) => void;
  handleInteraction?: () => void;
  taskDescriptionRef: React.RefObject<TaskDescriptionHandle | null>;
}

/**
 * Hook that manages task-specific state for the generate prompt feature.
 * This includes guidance generation and text improvement functionality,
 * but gets its taskDescription state from coreState.
 */
export function useGeneratePromptTaskState({
  taskDescription,
  setTaskDescription,
  handleInteraction,
  taskDescriptionRef
}: UseGeneratePromptTaskStateProps) {
  // Initialize task description state for UI-specific concerns, but use the provided state
  const {
    isImprovingText,
    textImprovementJobId,
    handleImproveSelection,
  } = useTaskDescriptionState({
    activeSessionId: null,
    taskDescriptionRef,
    onInteraction: handleInteraction,
  });

  // Initialize guidance generation state
  const {
    isGeneratingGuidance,
    handleGenerateGuidance: baseHandleGenerateGuidance,
  } = useGuidanceGeneration({
    projectDirectory: null,
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
    // Reset task description by setting it to empty string
    setTaskDescription("");
    // No explicit reset for guidance generation as its state is ephemeral
  }, [setTaskDescription]);

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
