import { createContext, useContext, type ReactNode } from "react";

import {
  type TaskContextValue,
  type TaskContextState as _TaskContextState,
  type TaskContextActions as _TaskContextActions,
} from "./_types/task-description-types";
import { logError } from "@/utils/error-handling";

// Create the context with a default value
const defaultValue: TaskContextValue = {
  state: {
    taskDescriptionRef: { current: null }, // Provide a stable, null-initialized ref object
    tokenEstimate: null,
    isRefiningTask: false,
    isDoingWebSearch: false,
    canUndo: false,
    canRedo: false,
    webSearchResults: null,
    // Video analysis state defaults
    isAnalyzingVideo: false,
    videoAnalysisJobId: null,
    videoAnalysisPrompt: '',
  },
  actions: {
    // These default implementations will be replaced by actual implementations
    handleRefineTask: async () => Promise.resolve(),
    handleWebSearch: async () => Promise.resolve(),
    cancelWebSearch: async () => Promise.resolve(),
    flushPendingTaskChanges: () => null,
    reset: () => {},
    undo: () => {},
    redo: () => {},
    applyWebSearchResults: () => {},
    // Video analysis actions
    setVideoAnalysisPrompt: () => {},
    handleAnalyzeVideo: async () => Promise.resolve(),
    resetVideoState: () => {},
  },
};

// Create the context
export const TaskContext = createContext<TaskContextValue>(defaultValue);

// Custom hook to use the context
export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    const error = new Error("useTaskContext must be used within a TaskContextProvider");
    logError(error, "Task Context - Hook Used Outside Provider").catch(() => {});
    throw error;
  }
  return context;
};

// Provider component
interface TaskContextProviderProps {
  value: TaskContextValue;
  children: ReactNode;
}

export const TaskContextProvider = ({
  value,
  children,
}: TaskContextProviderProps) => {
  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
};

TaskContextProvider.displayName = "TaskContextProvider";
