export interface RegexContextState {
  // Regex UI state (validation errors, generation status)
  titleRegexError: string | null;
  contentRegexError: string | null;
  negativeTitleRegexError: string | null;
  negativeContentRegexError: string | null;
  isGeneratingTaskRegex: boolean;
  generatingRegexJobId: string | null;
  regexGenerationError: string | null;
  
  // Individual field generation state
  generatingFieldType: 'title' | 'content' | 'negativeTitle' | 'negativeContent' | undefined;
  generatingFieldJobId: string | undefined;
  fieldRegexGenerationError: string | undefined;
  
  // New description fields
  titleRegexDescription: string;
  contentRegexDescription: string;
  negativeTitleRegexDescription: string;
  negativeContentRegexDescription: string;
  regexSummaryExplanation: string;
  
  // Summary generation state
  isGeneratingSummaryExplanation: boolean;
  generatingSummaryJobId: string | undefined;
  summaryGenerationError: string | undefined;
}

export interface RegexContextActions {
  // Regex actions
  setTitleRegex: (value: string) => void;
  setContentRegex: (value: string) => void;
  setNegativeTitleRegex: (value: string) => void;
  setNegativeContentRegex: (value: string) => void;
  setIsRegexActive: (value: boolean) => void;
  
  // Description setters
  setTitleRegexDescription: (value: string) => void;
  setContentRegexDescription: (value: string) => void;
  setNegativeTitleRegexDescription: (value: string) => void;
  setNegativeContentRegexDescription: (value: string) => void;
  
  // Individual regex generation
  handleGenerateRegexForField: (fieldType: 'title' | 'content' | 'negativeTitle' | 'negativeContent', description: string) => Promise<void>;
  
  // Summary generation
  handleGenerateSummaryExplanation: () => Promise<void>;
  
  // Legacy method (keep for backward compatibility)
  handleGenerateRegexFromTask: () => Promise<void>;
  
  applyRegexPatterns: (patterns: {
    titleRegex?: string;
    contentRegex?: string;
    negativeTitleRegex?: string;
    negativeContentRegex?: string;
    titleRegexDescription?: string;
    contentRegexDescription?: string;
    negativeTitleRegexDescription?: string;
    negativeContentRegexDescription?: string;
  }) => void;
  handleClearPatterns: () => void;
  reset: () => void;
}

export interface RegexContextValue {
  state: RegexContextState;
  actions: RegexContextActions;
}
