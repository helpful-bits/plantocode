"use client";

import { useMemo } from "react";
import { useImplementationPlanActions } from "./use-implementation-plan-actions";

/**
 * Hook for managing implementation plan state for the generate prompt feature.
 * This hook is a clean wrapper around useImplementationPlanActions.
 */
export function useGeneratePromptPlanState() {
  // Initialize implementation plan actions (which internally uses session context)
  const implementationPlanActions = useImplementationPlanActions();

  return useMemo(
    () => ({
      // Implementation plan state
      isCreatingPlan: implementationPlanActions.isCreatingPlan,
      planCreationState: implementationPlanActions.planCreationState,

      // Implementation plan actions
      handleCreateImplementationPlan: implementationPlanActions.handleCreateImplementationPlan,
    }),
    [
      implementationPlanActions.isCreatingPlan,
      implementationPlanActions.planCreationState,
      implementationPlanActions.handleCreateImplementationPlan,
    ]
  );
}
