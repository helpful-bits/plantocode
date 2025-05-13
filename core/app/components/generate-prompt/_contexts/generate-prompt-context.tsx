"use client";

import { createContext, useContext } from "react";
import { Session } from "@/types/session-types";
import { LoadedSessionFilePrefs } from "../_hooks/use-generate-prompt-state";

// Define the structure of the context value
export interface GeneratePromptContextValue {
  // Session state
  activeSessionId: string | null;
  isStateLoaded: boolean;
  isSwitchingSession: boolean;
  isRestoringSession: boolean;
  sessionInitialized: boolean;
  sessionName: string;
  hasUnsavedChanges: boolean;
  isGeneratingGuidance: boolean;
  isFormSaving: boolean;
  error: string;

  // Project data
  projectDirectory: string | null;
  projectDataLoading: boolean;

  // Direct access to taskDescription for components that need it
  taskDescription?: string;

  // No longer need loadedSessionFilePrefs here as it's managed directly by FileManagementProvider
  
  // Task state
  taskState: {
    taskDescription: string;
    taskDescriptionRef: React.RefObject<HTMLTextAreaElement> | null;
    setTaskDescription: (value: string) => void;
    reset: () => void;
  };

  // Regex state
  regexState: {
    titleRegex: string;
    contentRegex: string;
    negativeTitleRegex: string;
    negativeContentRegex: string;
    isRegexActive: boolean;
    isGeneratingTaskRegex: boolean;
    generatingRegexJobId: string | null;
    regexGenerationError: string | null;
    setTitleRegex: (value: string) => void;
    setContentRegex: (value: string) => void;
    setNegativeTitleRegex: (value: string) => void;
    setNegativeContentRegex: (value: string) => void;
    setIsRegexActive: (value: boolean) => void;
    handleGenerateRegexFromTask: () => Promise<void>;
    applyRegexPatterns: (patterns: any) => void;
    handleClearPatterns: () => void;
    reset: () => void;
  };

  
  // Prompt state
  prompt?: string;
  tokenCount?: number;
  copySuccess?: boolean;
  showPrompt: boolean;
  
  // Implementation plan state
  isCreatingPlan: boolean;
  planCreationState: 'idle' | 'submitting' | 'submitted';
  isCopyingPlanPrompt: boolean;
  isEstimatingTokens: boolean;
  estimatedTokens: number | null;
  
  // Session actions
  resetAllState: () => void;
  setSessionName: (name: string) => void;
  handleGenerateGuidance: (selectedPaths?: string[]) => Promise<void>;
  saveSessionState: (
    sessionId: string, 
    stateToSave?: any,
    fileState?: {
      searchTerm: string;
      pastedPaths: string;
      includedFiles: string[];
      forceExcludedFiles: string[];
      searchSelectedFilesOnly: boolean;
    }
  ) => Promise<void>;
  // New method to immediately flush any pending debounced saves
  flushPendingSaves: (
    fileStateGetter?: () => {
      searchTerm: string;
      pastedPaths: string;
      includedFiles: string[];
      forceExcludedFiles: string[];
      searchSelectedFilesOnly: boolean;
    }
  ) => Promise<boolean>;
  getCurrentSessionState: (
    fileState?: {
      searchTerm: string;
      pastedPaths: string;
      includedFiles: string[];
      forceExcludedFiles: string[];
      searchSelectedFilesOnly: boolean;
    }
  ) => any;
  setSessionInitialized: (value: boolean) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  handleInteraction: (
    fileStateGetter?: () => {
      searchTerm: string;
      pastedPaths: string;
      includedFiles: string[];
      forceExcludedFiles: string[];
      searchSelectedFilesOnly: boolean;
    }
  ) => void;
  
  // Prompt methods
  setShowPrompt: (value: boolean) => void;
  copyPrompt?: () => Promise<void>;
  handleGenerateCodebase: () => Promise<void>;
  
  // Implementation plan methods
  handleCreateImplementationPlan: (taskDescription: string, includedPaths: string[]) => Promise<void>;
  handleCopyImplementationPlanPrompt: (taskDescription: string, includedPaths: string[]) => Promise<void>;
  handleGetImplementationPlanPrompt: (taskDescription: string, includedPaths: string[]) => Promise<string | null>;
  handleEstimatePlanTokens: (taskDescription: string, includedPaths: string[]) => Promise<void>;
}

// Create the context with a default undefined value
export const GeneratePromptContext = createContext<GeneratePromptContextValue | undefined>(undefined);

// Create a hook for using the context that provides type safety
export function useGeneratePrompt(): GeneratePromptContextValue {
  const context = useContext(GeneratePromptContext);
  
  if (context === undefined) {
    throw new Error('useGeneratePrompt must be used within a GeneratePromptProvider');
  }
  
  return context;
}