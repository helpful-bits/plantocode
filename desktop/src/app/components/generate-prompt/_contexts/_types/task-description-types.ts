import type { TaskDescriptionHandle } from "../../_components/task-description";
import type { RefObject } from "react";

export interface TokenEstimate {
  totalTokens: number;
  systemPromptTokens: number;
  userPromptTokens: number;
}

export interface TaskContextState {
  // Task description UI state
  taskDescriptionRef: RefObject<TaskDescriptionHandle | null>;
  tokenEstimate: TokenEstimate | null;
  isRefiningTask: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface TaskContextActions {
  // Task description actions
  handleRefineTask: () => Promise<void>;
  flushPendingTaskChanges: () => string | null; // Immediately flush any pending task description changes and return current value
  reset: () => void;
  undo: () => void;
  redo: () => void;
}

export interface TaskContextValue {
  state: TaskContextState;
  actions: TaskContextActions;
}
