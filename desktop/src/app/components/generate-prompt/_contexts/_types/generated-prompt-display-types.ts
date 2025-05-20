export interface DisplayContextState {
  // Generated prompt state
  prompt: string | undefined;
  tokenCount: number | undefined;
  copySuccess: boolean | undefined;
  showPrompt: boolean;
}

export interface DisplayContextActions {
  // Generated prompt display actions
  setShowPrompt: (value: boolean) => void;
  copyPrompt: () => Promise<void>;
}

export interface DisplayContextValue {
  state: DisplayContextState;
  actions: DisplayContextActions;
}
