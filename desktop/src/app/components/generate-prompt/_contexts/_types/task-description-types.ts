import type { TaskDescriptionHandle } from "../../_components/task-description";
import type React from "react";

export interface TaskContextState {
  // Task description state
  taskDescription: string;
  taskDescriptionRef: React.RefObject<TaskDescriptionHandle> | null;
  isGeneratingGuidance: boolean;
  isImprovingText: boolean;
  textImprovementJobId: string | null;
}

export interface TaskContextActions {
  // Task description actions
  setTaskDescription: (value: string) => void;
  handleGenerateGuidance: (selectedPaths?: string[]) => Promise<void>;
  handleImproveSelection: (selection: string) => Promise<void>;
  reset: () => void;
}

export interface TaskContextValue {
  state: TaskContextState;
  actions: TaskContextActions;
}
