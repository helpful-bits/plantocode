import { createContext, useContext, type ReactNode } from "react";

import {
  type PlanContextValue,
} from "./_types/implementation-plan-types";
import { logError } from "@/utils/error-handling";

// Create the context with a default value
const defaultValue: PlanContextValue = {
  state: {
    isCreatingPlan: false,
    planCreationState: "idle",
    currentModel: undefined,
  },
  actions: {
    // These default implementations will be replaced by actual implementations
    handleCreateImplementationPlan: async () => Promise.resolve(),
  },
};

// Create the context
export const PlanContext = createContext<PlanContextValue>(defaultValue);

// Custom hook to use the context
export const usePlanContext = () => {
  const context = useContext(PlanContext);
  if (!context) {
    const error = new Error("usePlanContext must be used within a PlanContextProvider");
    logError(error, "Plan Context - Hook Used Outside Provider").catch(() => {});
    throw error;
  }
  return context;
};

// Provider component
interface PlanContextProviderProps {
  value: PlanContextValue;
  children: ReactNode;
}

export const PlanContextProvider = ({
  value,
  children,
}: PlanContextProviderProps) => {
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
};

PlanContextProvider.displayName = "PlanContextProvider";
