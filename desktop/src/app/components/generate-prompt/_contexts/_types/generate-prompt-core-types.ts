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
  isSessionFormLoading: boolean;
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
  handleGenerateCodebase: () => Promise<void>;
}

export interface CorePromptContextValue {
  state: CorePromptContextState;
  actions: CorePromptContextActions;
}
