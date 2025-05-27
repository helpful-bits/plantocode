import type { TaskDescriptionHandle } from "../../_components/task-description";
import type { RefObject } from "react";

export interface TaskContextState {
  // Task description UI state
  taskDescriptionRef: RefObject<TaskDescriptionHandle | null>;
  isGeneratingGuidance: boolean;
  isImprovingText: boolean;
  textImprovementJobId?: string;
}

export interface TaskContextActions {
  // Task description actions
  handleGenerateGuidance: (selectedPaths?: string[]) => Promise<void>;
  handleImproveSelection: (selection: string) => Promise<void>;
  reset: () => void;
}

export interface TaskContextValue {
  state: TaskContextState;
  actions: TaskContextActions;
}
