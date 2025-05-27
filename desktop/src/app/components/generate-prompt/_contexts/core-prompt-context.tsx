import { createContext, useContext, type ReactNode } from "react";

import {
  type CorePromptContextValue,
} from "./_types/generate-prompt-core-types";

// Create the context with a default value
const defaultValue: CorePromptContextValue = {
  state: {
    // Session state
    activeSessionId: null,
    isStateLoaded: false,
    isSwitchingSession: false,
    isRestoringSession: false,
    sessionInitialized: false,
    sessionName: "",
    hasUnsavedChanges: false,
    isFormSaving: false,
    error: null,

    // Project data
    projectDirectory: null,
    projectDataLoading: false,
  },
  actions: {
    // These default implementations will be replaced by actual implementations
    resetAllState: () => {},
    setSessionName: () => {},
    saveSessionState: async () => Promise.resolve(),
    flushPendingSaves: async () => Promise.resolve(false),
    setSessionInitialized: () => {},
    setHasUnsavedChanges: () => {},
    handleInteraction: () => {},
    getCurrentSessionState: () => ({
      projectDirectory: "",
      taskDescription: "",
      titleRegex: "",
      contentRegex: "",
      negativeTitleRegex: "",
      negativeContentRegex: "",
      isRegexActive: true,
      searchTerm: "",
      includedFiles: [],
      forceExcludedFiles: [],
      searchSelectedFilesOnly: false,
      codebaseStructure: "",
      createdAt: Date.now(),
      modelUsed: undefined,
    }),
    handleGenerateCodebase: async () => Promise.resolve(),
  },
};

// Create the context
export const CorePromptContext =
  createContext<CorePromptContextValue>(defaultValue);

// Custom hook to use the context
export const useCorePromptContext = () => {
  const context = useContext(CorePromptContext);
  if (!context) {
    throw new Error(
      "useCorePromptContext must be used within a CorePromptContextProvider"
    );
  }
  return context;
};

// Provider component
interface CorePromptContextProviderProps {
  value: CorePromptContextValue;
  children: ReactNode;
}

export const CorePromptContextProvider = ({
  value,
  children,
}: CorePromptContextProviderProps) => {
  return (
    <CorePromptContext.Provider value={value}>
      {children}
    </CorePromptContext.Provider>
  );
};

CorePromptContextProvider.displayName = "CorePromptContextProvider";
