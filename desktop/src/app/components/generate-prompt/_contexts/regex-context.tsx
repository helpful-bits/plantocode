import { createContext, useContext, type ReactNode } from "react";

import {
  type RegexContextValue,
  type RegexContextState as _RegexContextState,
  type RegexContextActions as _RegexContextActions,
} from "./_types/regex-types";

// Create the context with a default value
const defaultValue: RegexContextValue = {
  state: {
    titleRegexError: null,
    contentRegexError: null,
    negativeTitleRegexError: null,
    negativeContentRegexError: null,
    isGeneratingTaskRegex: false,
    generatingRegexJobId: null,
    regexGenerationError: null,
    generatingFieldType: undefined,
    generatingFieldJobId: undefined,
    fieldRegexGenerationError: undefined,
    titleRegexDescription: "",
    contentRegexDescription: "",
    negativeTitleRegexDescription: "",
    negativeContentRegexDescription: "",
    regexSummaryExplanation: "",
    isGeneratingSummaryExplanation: false,
    generatingSummaryJobId: undefined,
    summaryGenerationError: undefined,
  },
  actions: {
    // These default implementations will be replaced by actual implementations
    setTitleRegex: () => {},
    setContentRegex: () => {},
    setNegativeTitleRegex: () => {},
    setNegativeContentRegex: () => {},
    setIsRegexActive: () => {},
    setTitleRegexDescription: () => {},
    setContentRegexDescription: () => {},
    setNegativeTitleRegexDescription: () => {},
    setNegativeContentRegexDescription: () => {},
    handleGenerateRegexForField: async () => Promise.resolve(),
    handleGenerateSummaryExplanation: async () => Promise.resolve(),
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

RegexContextProvider.displayName = "RegexContextProvider";
