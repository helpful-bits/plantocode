export interface CorePromptContextState {
  // Session state
  activeSessionId: string | null;
  isStateLoaded: boolean;
  isSwitchingSession: boolean;
  isRestoringSession: boolean;
  sessionInitialized: boolean;
  sessionName: string;
  hasUnsavedChanges: boolean;
  isFormSaving: boolean;
  error: Error | string | null;

  // Project data
  projectDirectory: string | null;
  projectDataLoading: boolean;
}

export interface CorePromptContextActions {
  // Core actions
  resetAllState: () => void;
  setSessionName: (name: string) => void;
  saveSessionState: () => Promise<void>;
  flushPendingSaves: () => Promise<boolean>;
  setSessionInitialized: (value: boolean) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  handleInteraction: () => void;
  getCurrentSessionState: () => {
    projectDirectory: string;
    taskDescription: string;
    titleRegex: string;
    contentRegex: string;
    negativeTitleRegex: string;
    negativeContentRegex: string;
    isRegexActive: boolean;
    searchTerm: string;
    includedFiles: string[];
    forceExcludedFiles: string[];
    searchSelectedFilesOnly: boolean;
    codebaseStructure: string;
    createdAt: number;
    modelUsed?: string;
  };

  handleGenerateCodebase: () => Promise<void>;
}

export interface CorePromptContextValue {
  state: CorePromptContextState;
  actions: CorePromptContextActions;
}
