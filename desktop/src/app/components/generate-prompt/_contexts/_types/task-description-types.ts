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
  flushPendingTaskChanges: () => string | null; // Immediately flush any pending task description changes and return current value
  reset: () => void;
}

export interface TaskContextValue {
  state: TaskContextState;
  actions: TaskContextActions;
}
