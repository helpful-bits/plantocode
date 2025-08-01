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
  isDoingWebSearch: boolean;
  canUndo: boolean;
  canRedo: boolean;
  webSearchResults: string[] | null;
  
  // Video analysis state
  isAnalyzingVideo: boolean;
  videoAnalysisJobId: string | null;
  videoAnalysisPrompt: string;
}

export interface TaskContextActions {
  // Task description actions
  handleRefineTask: () => Promise<void>;
  handleWebSearch: (justPrompts?: boolean) => Promise<void>;
  cancelWebSearch: () => Promise<void>;
  flushPendingTaskChanges: () => string | null; // Immediately flush any pending task description changes and return current value
  reset: () => void;
  undo: () => void;
  redo: () => void;
  applyWebSearchResults: (results?: string[]) => void;
  
  // Video analysis actions
  setVideoAnalysisPrompt: (prompt: string) => void;
  startVideoAnalysisRecording: (args: { prompt: string; recordAudio: boolean; audioDeviceId: string; frameRate: number }) => Promise<void>;
  resetVideoState: () => void;
  cancelVideoAnalysis: () => Promise<void>;
}

export interface TaskContextValue {
  state: TaskContextState;
  actions: TaskContextActions;
}
