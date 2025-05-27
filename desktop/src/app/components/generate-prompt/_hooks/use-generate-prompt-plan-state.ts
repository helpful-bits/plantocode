"use client";

import { useMemo } from "react";
import { useImplementationPlanActions } from "./use-implementation-plan-actions";

export function useGeneratePromptPlanState() {
  // Initialize implementation plan actions
  const implementationPlanActions = useImplementationPlanActions();

  return useMemo(
    () => ({
      // Implementation plan state
      isCreatingPlan: implementationPlanActions.isCreatingPlan,
      planCreationState: implementationPlanActions.planCreationState,

      // These properties are no longer provided by useImplementationPlanActions,
      // so we provide default values
      isCopyingPlanPrompt: false,
      isEstimatingTokens: false,
      estimatedTokens: 0,

      // Implementation plan actions
      handleCreateImplementationPlan:
        implementationPlanActions.handleCreateImplementationPlan,

      // These methods are no longer provided by useImplementationPlanActions,
      // so we provide empty implementations
      handleCopyImplementationPlanPrompt: () => {},
      handleGetImplementationPlanPrompt: () => "",
      handleEstimatePlanTokens: () => Promise.resolve(0),
    }),
    [
      implementationPlanActions.isCreatingPlan,
      implementationPlanActions.planCreationState,
      implementationPlanActions.handleCreateImplementationPlan,
    ]
  );
}
