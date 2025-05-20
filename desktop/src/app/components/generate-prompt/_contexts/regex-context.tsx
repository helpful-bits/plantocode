import { createContext, useContext, type ReactNode } from "react";

import {
  type RegexContextValue,
  type RegexContextState as _RegexContextState,
  type RegexContextActions as _RegexContextActions,
} from "./_types/regex-types";

// Create the context with a default value
const defaultValue: RegexContextValue = {
  state: {
    titleRegex: "",
    contentRegex: "",
    negativeTitleRegex: "",
    negativeContentRegex: "",
    isRegexActive: false,
    isGeneratingTaskRegex: false,
    generatingRegexJobId: null,
    regexGenerationError: null,
  },
  actions: {
    // These default implementations will be replaced by actual implementations
    setTitleRegex: () => {},
    setContentRegex: () => {},
    setNegativeTitleRegex: () => {},
    setNegativeContentRegex: () => {},
    setIsRegexActive: () => {},
    handleGenerateRegexFromTask: async () => Promise.resolve(),
    applyRegexPatterns: () => {},
    handleClearPatterns: () => {},
    reset: () => {},
  },
};

// Create the context
export const RegexContext = createContext<RegexContextValue>(defaultValue);

// Custom hook to use the context
export const useRegexContext = () => {
  const context = useContext(RegexContext);
  if (!context) {
    throw new Error(
      "useRegexContext must be used within a RegexContextProvider"
    );
  }
  return context;
};

// Provider component
interface RegexContextProviderProps {
  value: RegexContextValue;
  children: ReactNode;
}

export const RegexContextProvider = ({
  value,
  children,
}: RegexContextProviderProps) => {
  return (
    <RegexContext.Provider value={value}>{children}</RegexContext.Provider>
  );
};
