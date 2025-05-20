"use client";

import { useCallback } from "react";

import { useRegexState } from "./use-regex-state";

export interface UseGeneratePromptRegexStateProps {
  // State values passed from core state
  titleRegex: string;
  contentRegex: string;
  negativeTitleRegex: string;
  negativeContentRegex: string;
  isRegexActive: boolean;

  // Updater functions from core state
  setTitleRegex: (value: string) => void;
  setContentRegex: (value: string) => void;
  setNegativeTitleRegex: (value: string) => void;
  setNegativeContentRegex: (value: string) => void;
  setIsRegexActive: (value: boolean) => void;

  // Other props
  activeSessionId: string | null;
  taskDescription: string;
  handleInteraction?: () => void;
}

export function useGeneratePromptRegexState({
  // State values from core
  titleRegex,
  contentRegex,
  negativeTitleRegex,
  negativeContentRegex,
  isRegexActive,

  // Updater functions from core
  setTitleRegex,
  setContentRegex,
  setNegativeTitleRegex,
  setNegativeContentRegex,
  setIsRegexActive,

  // Other props
  activeSessionId,
  taskDescription,
  handleInteraction,
}: UseGeneratePromptRegexStateProps) {
  // Initialize regex state with UI-specific logic
  const {
    isGeneratingTaskRegex,
    generatingRegexJobId,
    regexGenerationError,
    handleGenerateRegexFromTask: baseHandleGenerateRegexFromTask,
    applyRegexPatterns,
    handleClearPatterns: baseClearPatterns,
  } = useRegexState({
    initialTitleRegex: titleRegex,
    initialContentRegex: contentRegex,
    initialNegativeTitleRegex: negativeTitleRegex,
    initialNegativeContentRegex: negativeContentRegex,
    initialIsRegexActive: isRegexActive,
    onStateChange: handleInteraction,
    taskDescription,
    activeSessionId,
  });

  // Wrap the regex generation handler to call handleInteraction
  const handleGenerateRegexFromTask = useCallback(async () => {
    if (handleInteraction) {
      handleInteraction();
    }
    return baseHandleGenerateRegexFromTask();
  }, [baseHandleGenerateRegexFromTask, handleInteraction]);

  // Wrap the clear patterns handler
  const handleClearPatterns = useCallback(() => {
    if (handleInteraction) {
      handleInteraction();
    }
    return baseClearPatterns();
  }, [baseClearPatterns, handleInteraction]);

  // Create a reset function to clear all regex patterns
  const reset = useCallback(() => {
    if (handleInteraction) {
      handleInteraction();
    }
    setTitleRegex("");
    setContentRegex("");
    setNegativeTitleRegex("");
    setNegativeContentRegex("");
    setIsRegexActive(true);
  }, [
    handleInteraction,
    setTitleRegex,
    setContentRegex,
    setNegativeTitleRegex,
    setNegativeContentRegex,
    setIsRegexActive,
  ]);

  return {
    // Regex generation UI state
    isGeneratingTaskRegex,
    generatingRegexJobId,
    regexGenerationError,
    
    // Current regex values
    titleRegex,
    contentRegex,
    negativeTitleRegex,
    negativeContentRegex,
    isRegexActive,
    
    // Regex actions
    handleGenerateRegexFromTask,
    applyRegexPatterns,
    handleClearPatterns,
    reset,
  };
}
