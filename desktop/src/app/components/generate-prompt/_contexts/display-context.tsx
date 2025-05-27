import { createContext, useContext, type ReactNode } from "react";

import {
  type DisplayContextValue,
} from "./_types/generated-prompt-display-types";

// Create the context with a default value
const defaultValue: DisplayContextValue = {
  state: {
    prompt: undefined,
    tokenCount: undefined,
    copySuccess: undefined,
    showPrompt: false,
  },
  actions: {
    // These default implementations will be replaced by actual implementations
    setShowPrompt: () => {},
    copyPrompt: async () => Promise.resolve(),
  },
};

// Create the context
export const DisplayContext = createContext<DisplayContextValue>(defaultValue);

// Custom hook to use the context
export const useDisplayContext = () => {
  const context = useContext(DisplayContext);
  if (!context) {
    throw new Error(
      "useDisplayContext must be used within a DisplayContextProvider"
    );
  }
  return context;
};

// Provider component
interface DisplayContextProviderProps {
  value: DisplayContextValue;
  children: ReactNode;
}

export const DisplayContextProvider = ({
  value,
  children,
}: DisplayContextProviderProps) => {
  return (
    <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>
  );
};

DisplayContextProvider.displayName = "DisplayContextProvider";
