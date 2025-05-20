export interface RegexContextState {
  // Regex state
  titleRegex: string;
  contentRegex: string;
  negativeTitleRegex: string;
  negativeContentRegex: string;
  isRegexActive: boolean;
  isGeneratingTaskRegex: boolean;
  generatingRegexJobId: string | null;
  regexGenerationError: string | null;
}

export interface RegexContextActions {
  // Regex actions
  setTitleRegex: (value: string) => void;
  setContentRegex: (value: string) => void;
  setNegativeTitleRegex: (value: string) => void;
  setNegativeContentRegex: (value: string) => void;
  setIsRegexActive: (value: boolean) => void;
  handleGenerateRegexFromTask: () => Promise<void>;
  applyRegexPatterns: (patterns: {
    titleRegex?: string;
    contentRegex?: string;
    negativeTitleRegex?: string;
    negativeContentRegex?: string;
  }) => void;
  handleClearPatterns: () => void;
  reset: () => void;
}

export interface RegexContextValue {
  state: RegexContextState;
  actions: RegexContextActions;
}
