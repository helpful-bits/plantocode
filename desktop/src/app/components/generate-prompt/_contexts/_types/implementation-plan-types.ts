export interface PlanContextState {
  // Implementation plan state
  isCreatingPlan: boolean;
  planCreationState: "idle" | "submitting" | "submitted";
}

export interface PlanContextActions {
  // Implementation plan actions
  handleCreateImplementationPlan: (
    taskDescription: string,
    includedPaths: string[]
  ) => Promise<void>;
}

export interface PlanContextValue {
  state: PlanContextState;
  actions: PlanContextActions;
}
