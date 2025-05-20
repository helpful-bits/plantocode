export interface PlanContextState {
  // Implementation plan state
  isCreatingPlan: boolean;
  planCreationState: "idle" | "submitting" | "submitted";
  isCopyingPlanPrompt: boolean;
  isEstimatingTokens: boolean;
  estimatedTokens: number | null;
}

export interface PlanContextActions {
  // Implementation plan actions
  handleCreateImplementationPlan: (
    taskDescription: string,
    includedPaths: string[]
  ) => Promise<void>;
  handleCopyImplementationPlanPrompt: () => void;
  handleGetImplementationPlanPrompt: () => string;
  handleEstimatePlanTokens: () => Promise<number>;
}

export interface PlanContextValue {
  state: PlanContextState;
  actions: PlanContextActions;
}
