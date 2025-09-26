export interface PlanContextState {
  // Implementation plan state
  isCreatingPlan: boolean;
  planCreationState: "idle" | "submitting" | "submitted";
  // Current model for implementation plan
  currentModel?: string;
}

export interface PlanContextActions {
  // Implementation plan actions
  handleCreateImplementationPlan: (
    taskDescription: string,
    includedPaths: string[],
    selectedRootDirectories?: string[] | null,
    enableWebSearch?: boolean,
    includeProjectStructure?: boolean
  ) => Promise<void>;
}

export interface PlanContextValue {
  state: PlanContextState;
  actions: PlanContextActions;
}
