import { createContext, useContext, type ReactNode } from "react";

import {
  type PlanContextValue,
} from "./_types/implementation-plan-types";

// Create the context with a default value
const defaultValue: PlanContextValue = {
  state: {
    isCreatingPlan: false,
    planCreationState: "idle",
    isCopyingPlanPrompt: false,
    isEstimatingTokens: false,
    estimatedTokens: null,
  },
  actions: {
    // These default implementations will be replaced by actual implementations
    handleCreateImplementationPlan: async () => Promise.resolve(),
    handleCopyImplementationPlanPrompt: async () => Promise.resolve(),
    handleGetImplementationPlanPrompt: () => "",
    handleEstimatePlanTokens: async () => Promise.resolve(0),
  },
};

// Create the context
export const PlanContext = createContext<PlanContextValue>(defaultValue);

// Custom hook to use the context
export const usePlanContext = () => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error("usePlanContext must be used within a PlanContextProvider");
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
