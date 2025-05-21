import React, { createContext, useContext, type ReactNode } from "react";

import {
  type TaskContextValue,
  type TaskContextState as _TaskContextState,
  type TaskContextActions as _TaskContextActions,
} from "./_types/task-description-types";

// Create the context with a default value
const defaultValue: TaskContextValue = {
  state: {
    taskDescription: "",
    taskDescriptionRef: React.createRef(), // Create a ref object instead of null
    isGeneratingGuidance: false,
    isImprovingText: false,
    textImprovementJobId: null,
  },
  actions: {
    // These default implementations will be replaced by actual implementations
    setTaskDescription: () => {},
    handleGenerateGuidance: async () => Promise.resolve(),
    handleImproveSelection: async () => Promise.resolve(),
    reset: () => {},
  },
};

// Create the context
export const TaskContext = createContext<TaskContextValue>(defaultValue);

// Custom hook to use the context
export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error("useTaskContext must be used within a TaskContextProvider");
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
