"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { useNotification } from '@/lib/contexts/notification-context';
import { sessionSyncService } from '@/lib/services/session-sync-service';
import debounce from '@/lib/utils/debounce';

interface UseRegexStateProps {
  activeSessionId: string | null;
  taskDescription: string;
  onInteraction?: () => void;
}

export function useRegexState({
  activeSessionId,
  taskDescription,
  onInteraction
}: UseRegexStateProps) {
  // Constants
  const REGEX_MAX_LENGTH = 500;

  // State variables
  const [titleRegex, setTitleRegex] = useState("");
  const [contentRegex, setContentRegex] = useState("");
  const [negativeTitleRegex, setNegativeTitleRegex] = useState("");
  const [negativeContentRegex, setNegativeContentRegex] = useState("");
  const [isRegexActive, setIsRegexActive] = useState(true);
  
  // Error states for regex validation
  const [titleRegexError, setTitleRegexError] = useState<string | null>(null);
  const [contentRegexError, setContentRegexError] = useState<string | null>(null);
  const [negativeTitleRegexError, setNegativeTitleRegexError] = useState<string | null>(null);
  const [negativeContentRegexError, setNegativeContentRegexError] = useState<string | null>(null);
  
  // State for regex generation via AI
  const [isGeneratingTaskRegex, setIsGeneratingTaskRegex] = useState(false);
  const [generatingRegexJobId, setGeneratingRegexJobId] = useState<string | null>(null);
  const [regexGenerationError, setRegexGenerationError] = useState<string | null>(null);
  
  // External hooks
  const { showNotification } = useNotification();

  // Reset function to clear state
  const reset = useCallback(() => {
    console.log('[RegexState] Resetting regex state');
    
    // Reset patterns
    setTitleRegex("");
    setContentRegex("");
    setNegativeTitleRegex("");
    setNegativeContentRegex("");
    
    // Reset validation errors
    setTitleRegexError(null);
    setContentRegexError(null);
    setNegativeTitleRegexError(null);
    setNegativeContentRegexError(null);
    
    // Reset regex generation state
    setIsGeneratingTaskRegex(false);
    setGeneratingRegexJobId(null);
    setRegexGenerationError(null);
    
    // Reset regex active state to default (true)
    setIsRegexActive(true);
  }, []);
  
  // Add useEffect to monitor activeSessionId changes for automatic reset
  useEffect(() => {
    // When activeSessionId changes to null, reset the state
    if (activeSessionId === null) {
      console.log('[RegexState] Session ID set to null, resetting regex state');
      reset();
    }
    
    // No need to do anything when activeSessionId changes to a non-null value
    // as data will be loaded by the session loading handler
  }, [activeSessionId, reset]);
  
  
  // Utility function to validate regex without crashing
  const validateRegex = useCallback((pattern: string): string | null => {
    if (!pattern || pattern.trim() === "") {
      return null;
    }
    
    if (pattern.length > REGEX_MAX_LENGTH) {
      return `Regex pattern is too long (max ${REGEX_MAX_LENGTH} characters)`;
    }
    
    try {
      // Check if regex is valid by creating it
      new RegExp(pattern, 'i');
      return null;
    } catch (e) {
      return `Invalid regex: ${(e as Error).message}`;
    }
  }, []);

  // Set API for accessing regex patterns from outside
  // All setter functions include validation
  const setTitleRegexWithValidation = (value: string) => {
    handleTitleRegexChange(value);
  };
  
  const setContentRegexWithValidation = (value: string) => {
    handleContentRegexChange(value);
  };
  
  const setNegativeTitleRegexWithValidation = (value: string) => {
    handleNegativeTitleRegexChange(value);
  };
  
  const setNegativeContentRegexWithValidation = (value: string) => {
    handleNegativeContentRegexChange(value);
  };

  // Handler for title regex changes
  const handleTitleRegexChange = useCallback((value: string) => {
    setTitleRegex(value);
    const error = validateRegex(value);
    setTitleRegexError(error);

    // Notify parent component of changes
    if (onInteraction) {
      onInteraction();
    }
    
    // The setHasUnsavedChanges logic has been centralized in the onInteraction callback
  }, [validateRegex, onInteraction]);

  // Handler for content regex changes
  const handleContentRegexChange = useCallback((value: string) => {
    setContentRegex(value);
    const error = validateRegex(value);
    setContentRegexError(error);

    // Notify parent component of changes
    if (onInteraction) {
      onInteraction();
    }
    
    // The setHasUnsavedChanges logic has been centralized in the onInteraction callback
  }, [validateRegex, onInteraction]);

  // Handler for negative title regex changes
  const handleNegativeTitleRegexChange = useCallback((value: string) => {
    setNegativeTitleRegex(value);
    const error = validateRegex(value);
    setNegativeTitleRegexError(error);

    // Notify parent component of changes
    if (onInteraction) {
      onInteraction();
    }
    
    // The setHasUnsavedChanges logic has been centralized in the onInteraction callback
  }, [validateRegex, onInteraction]);

  // Handler for negative content regex changes
  const handleNegativeContentRegexChange = useCallback((value: string) => {
    setNegativeContentRegex(value);
    const error = validateRegex(value);
    setNegativeContentRegexError(error);

    // Notify parent component of changes
    if (onInteraction) {
      onInteraction();
    }
    
    // The setHasUnsavedChanges logic has been centralized in the onInteraction callback
  }, [validateRegex, onInteraction]);

  // Toggle regex active state
  const handleToggleRegexActive = useCallback((newValue?: boolean) => {
    setIsRegexActive(prev => typeof newValue === 'boolean' ? newValue : !prev);
    
    // Notify parent component of changes
    if (onInteraction) {
      onInteraction();
    }
    
    // The setHasUnsavedChanges logic has been centralized in the onInteraction callback
  }, [onInteraction]);

  // Generate regex from task description - stabilized with useCallback
  const handleGenerateRegexFromTask = useCallback(async () => {
    if (!taskDescription.trim()) {
      showNotification({
        title: "Cannot generate regex",
        message: "Please provide a task description first.",
        type: "warning"
      });
      return;
    }
    
    if (isGeneratingTaskRegex) {
      showNotification({
        title: "Already generating regex",
        message: "Please wait for the current generation to complete.",
        type: "warning"
      });
      return;
    }
    
    // Validate that activeSessionId is a string if it's used in the action
    if (activeSessionId !== null && typeof activeSessionId !== 'string') {
      console.error(`[RegexState] Invalid activeSessionId type: ${typeof activeSessionId}, value:`, activeSessionId);
      showNotification({
        title: "Error",
        message: "Invalid session ID format",
        type: "error"
      });
      return;
    }
    
    setIsGeneratingTaskRegex(true);
    setRegexGenerationError("");
    
    try {
      const result = await generateRegexPatternsAction(taskDescription);
      
      if (result.isSuccess && result.data) {
        if (typeof result.data === 'object' && 'jobId' in result.data) {
          setGeneratingRegexJobId(result.data.jobId);
          
          showNotification({
            title: "Generating regex patterns",
            message: "This may take a moment...",
            type: "info"
          });
        }
      } else {
        throw new Error(result.message || "Failed to start regex generation.");
      }
    } catch (error) {
      console.error("[RegexState] Error generating regex patterns:", error);
      setIsGeneratingTaskRegex(false);
      setRegexGenerationError(error instanceof Error ? error.message : "An unknown error occurred");
      
      showNotification({
        title: "Error generating regex",
        message: error instanceof Error ? error.message : "An unknown error occurred.",
        type: "error"
      });
    }
  }, [
    taskDescription, 
    isGeneratingTaskRegex, 
    activeSessionId, 
    showNotification,
    setIsGeneratingTaskRegex,
    setRegexGenerationError,
    setGeneratingRegexJobId
  ]);

  // Clear all patterns - stabilized with useCallback
  const handleClearPatterns = useCallback(() => {
    setTitleRegex("");
    setContentRegex("");
    setNegativeTitleRegex("");
    setNegativeContentRegex("");
    setTitleRegexError("");
    setContentRegexError("");
    setNegativeTitleRegexError("");
    setNegativeContentRegexError("");
    
    // Notify parent component of changes
    if (onInteraction) {
      onInteraction();
    }
  }, [
    onInteraction,
    setTitleRegex,
    setContentRegex,
    setNegativeTitleRegex,
    setNegativeContentRegex,
    setTitleRegexError,
    setContentRegexError,
    setNegativeTitleRegexError,
    setNegativeContentRegexError
  ]);

  // Apply regex patterns to state - stabilized with useCallback
  const applyRegexPatterns = useCallback(({
    titlePattern,
    contentPattern,
    negativeTitlePattern,
    negativeContentPattern
  }: {
    titlePattern?: string;
    contentPattern?: string;
    negativeTitlePattern?: string;
    negativeContentPattern?: string;
  }) => {
    // Only update non-empty patterns
    if (titlePattern) handleTitleRegexChange(titlePattern);
    if (contentPattern) handleContentRegexChange(contentPattern);
    if (negativeTitlePattern) handleNegativeTitleRegexChange(negativeTitlePattern);
    if (negativeContentPattern) handleNegativeContentRegexChange(negativeContentPattern);
    
    // Ensure regex is active
    setIsRegexActive(true);
    
    // Trigger the interaction callback, which will handle saving
    if (onInteraction) {
      onInteraction();
    }
  }, [
    handleTitleRegexChange,
    handleContentRegexChange,
    handleNegativeTitleRegexChange,
    handleNegativeContentRegexChange,
    setIsRegexActive,
    onInteraction
  ]);

  return useMemo(() => ({
    // State
    titleRegex,
    contentRegex,
    negativeTitleRegex,
    negativeContentRegex,
    isRegexActive,
    isGeneratingTaskRegex,
    regexGenerationError,
    titleRegexError,
    contentRegexError,
    negativeTitleRegexError,
    negativeContentRegexError,
    generatingRegexJobId,
    
    // Actions
    setTitleRegex: handleTitleRegexChange,
    setContentRegex: handleContentRegexChange,
    setNegativeTitleRegex: handleNegativeTitleRegexChange,
    setNegativeContentRegex: handleNegativeContentRegexChange,
    setIsRegexActive: handleToggleRegexActive,
    setIsGeneratingTaskRegex,
    handleGenerateRegexFromTask,
    handleClearPatterns,
    applyRegexPatterns,
    validateRegex,
    reset
  }), [
    titleRegex,
    contentRegex,
    negativeTitleRegex,
    negativeContentRegex,
    isRegexActive,
    isGeneratingTaskRegex,
    regexGenerationError,
    titleRegexError,
    contentRegexError,
    negativeTitleRegexError,
    negativeContentRegexError,
    generatingRegexJobId,
    handleTitleRegexChange,
    handleContentRegexChange,
    handleNegativeTitleRegexChange,
    handleNegativeContentRegexChange,
    handleToggleRegexActive,
    handleGenerateRegexFromTask,
    handleClearPatterns,
    applyRegexPatterns,
    validateRegex,
    reset
  ]);
} 