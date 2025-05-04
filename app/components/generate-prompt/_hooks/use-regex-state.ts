"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { useNotification } from '@/lib/contexts/notification-context';
import { sessionSyncService } from '@/lib/services/session-sync-service';
import debounce from '@/lib/utils/debounce';

interface UseRegexStateProps {
  activeSessionId: string | null;
  taskDescription: string;
  onInteraction?: () => void;
  setHasUnsavedChanges?: (value: boolean) => void;
}

export function useRegexState({
  activeSessionId,
  taskDescription,
  onInteraction,
  setHasUnsavedChanges
}: UseRegexStateProps) {
  // State
  const [titleRegex, setTitleRegex] = useState("");
  const [contentRegex, setContentRegex] = useState("");
  const [negativeTitleRegex, setNegativeTitleRegex] = useState("");
  const [negativeContentRegex, setNegativeContentRegex] = useState("");
  const [isRegexActive, setIsRegexActive] = useState(true);
  const [isGeneratingTaskRegex, setIsGeneratingTaskRegex] = useState(false);
  const [regexGenerationError, setRegexGenerationError] = useState("");
  const [titleRegexError, setTitleRegexError] = useState<string | null>(null);
  const [contentRegexError, setContentRegexError] = useState<string | null>(null);
  const [negativeTitleRegexError, setNegativeTitleRegexError] = useState<string | null>(null);
  const [negativeContentRegexError, setNegativeContentRegexError] = useState<string | null>(null);
  const [generatingRegexJobId, setGeneratingRegexJobId] = useState<string | null>(null);
  
  // External hooks
  const { showNotification } = useNotification();

  // Reset function to clear all regex state
  const reset = useCallback(() => {
    console.log('[RegexState] Resetting regex state');
    
    // Reset pattern values
    setTitleRegex("");
    setContentRegex("");
    setNegativeTitleRegex("");
    setNegativeContentRegex("");
    
    // Reset active state
    setIsRegexActive(false);
    
    // Reset generation state
    setIsGeneratingTaskRegex(false);
    setGeneratingRegexJobId(null);
    
    // Reset errors
    setRegexGenerationError("");
    setTitleRegexError(null);
    setContentRegexError(null);
    setNegativeTitleRegexError(null);
    setNegativeContentRegexError(null);
    
    // Reset saved state reference
    prevSavedStateRef.current = {
      titleRegex: '',
      contentRegex: '', 
      negativeTitleRegex: '',
      negativeContentRegex: '',
      isRegexActive: false
    };
  }, []);

  // Validate regex pattern
  const validateRegex = useCallback((pattern: string): boolean => {
    if (!pattern.trim()) return true; // Empty patterns are valid
    
    try {
      // Test if the pattern is valid by creating a RegExp object
      new RegExp(pattern);
      return true;
    } catch (error) {
      return false;
    }
  }, []);

  // Save regex state
  const saveRegexState = useCallback(async (sessionId: string | null) => {
    if (!sessionId) return;
    
    try {
      console.log(`[RegexState] Saving regex state for session: ${sessionId}`);
      
      // Add timestamp tracking to identify rapid calls
      const now = Date.now();
      const lastCallTime = (saveRegexState as any).lastCallTime || 0;
      const timeSinceLastCall = now - lastCallTime;
      (saveRegexState as any).lastCallTime = now;
      
      if (timeSinceLastCall < 5000) { // Check if less than 5 seconds since last call
        console.warn(`[RegexState] Warning: saveRegexState called again after only ${timeSinceLastCall}ms`);
      }
      
      await sessionSyncService.updateSessionState(
        sessionId,
        {
          titleRegex,
          contentRegex,
          negativeTitleRegex,
          negativeContentRegex,
          isRegexActive
        }
      );
    } catch (error) {
      console.error(`[RegexState] Error saving regex state:`, error);
    }
  }, [titleRegex, contentRegex, negativeTitleRegex, negativeContentRegex, isRegexActive]);
  
  // Create a debounced version of saveRegexState
  const debouncedSaveRegexState = useCallback((sessionId: string | null) => {
    const debouncedFn = debounce((id: string | null) => {
      console.log('[RegexState] Debounced save regex state triggered');
      saveRegexState(id);
    }, 3500); // Increased from 2500ms to 3500ms to reduce frequency
    
    debouncedFn(sessionId);
  }, [saveRegexState]);

  // Track previous saved state to avoid unnecessary updates
  const prevSavedStateRef = useRef({
    titleRegex: '',
    contentRegex: '', 
    negativeTitleRegex: '',
    negativeContentRegex: '',
    isRegexActive: true
  });

  // Last save timestamp
  const lastSaveTimeRef = useRef<number>(0);

  // Helper to determine if regex state has meaningfully changed
  const hasSignificantChanges = useCallback(() => {
    // Only save if there are actual changes from what was last saved
    const prevState = prevSavedStateRef.current;
    
    // Check if any field has actually changed
    const titleChanged = titleRegex !== prevState.titleRegex;
    const contentChanged = contentRegex !== prevState.contentRegex;
    const negTitleChanged = negativeTitleRegex !== prevState.negativeTitleRegex;
    const negContentChanged = negativeContentRegex !== prevState.negativeContentRegex;
    const activeChanged = isRegexActive !== prevState.isRegexActive;
    
    // Very small changes (e.g., adding a single character) can wait longer
    // Only trigger save if there's a significant change or enough time passed
    const hasSubstantialChange = 
      (titleChanged && Math.abs(titleRegex.length - prevState.titleRegex.length) > 5) ||
      (contentChanged && Math.abs(contentRegex.length - prevState.contentRegex.length) > 5) ||
      (negTitleChanged && Math.abs(negativeTitleRegex.length - prevState.negativeTitleRegex.length) > 5) ||
      (negContentChanged && Math.abs(negativeContentRegex.length - prevState.negativeContentRegex.length) > 5) ||
      activeChanged;
      
    const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
    const enoughTimePassedForMinorChange = timeSinceLastSave > 10000; // 10 seconds
    
    return hasSubstantialChange || enoughTimePassedForMinorChange;
  }, [contentRegex, isRegexActive, negativeTitleRegex, negativeContentRegex, titleRegex]);

  // Queue save with optimizations
  const queueSaveRegexState = useCallback((sessionId: string | null) => {
    if (!sessionId) return;
    
    // Only trigger save if there are significant changes
    if (hasSignificantChanges()) {
      debouncedSaveRegexState(sessionId);
      
      // Update saved state reference and timestamp
      prevSavedStateRef.current = {
        titleRegex,
        contentRegex,
        negativeTitleRegex,
        negativeContentRegex,
        isRegexActive
      };
      lastSaveTimeRef.current = Date.now();
    } else {
      console.log('[RegexState] Skipping save - no significant changes detected');
    }
  }, [debouncedSaveRegexState, hasSignificantChanges, titleRegex, contentRegex, negativeTitleRegex, negativeContentRegex, isRegexActive]);

  // Handle title regex change
  const handleTitleRegexChange = useCallback((value: string) => {
    setTitleRegex(value);
    
    // Validate the regex pattern
    if (!validateRegex(value)) {
      setTitleRegexError("Invalid regex pattern");
    } else {
      setTitleRegexError(null);
    }
    
    if (onInteraction) {
      onInteraction();
    }
    
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
    
    // Use optimized save queue instead of debounced save
    if (activeSessionId) {
      queueSaveRegexState(activeSessionId);
    }
  }, [validateRegex, onInteraction, setHasUnsavedChanges, activeSessionId, queueSaveRegexState]);

  // Handle content regex change
  const handleContentRegexChange = useCallback((value: string) => {
    setContentRegex(value);
    
    // Validate the regex pattern
    if (!validateRegex(value)) {
      setContentRegexError("Invalid regex pattern");
    } else {
      setContentRegexError(null);
    }
    
    if (onInteraction) {
      onInteraction();
    }
    
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
    
    // Use optimized save queue instead of debounced save
    if (activeSessionId) {
      queueSaveRegexState(activeSessionId);
    }
  }, [validateRegex, onInteraction, setHasUnsavedChanges, activeSessionId, queueSaveRegexState]);

  // Handle negative title regex change
  const handleNegativeTitleRegexChange = useCallback((value: string) => {
    setNegativeTitleRegex(value);
    
    // Validate the regex pattern
    if (!validateRegex(value)) {
      setNegativeTitleRegexError("Invalid regex pattern");
    } else {
      setNegativeTitleRegexError(null);
    }
    
    if (onInteraction) {
      onInteraction();
    }
    
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
    
    // Use optimized save queue instead of debounced save
    if (activeSessionId) {
      queueSaveRegexState(activeSessionId);
    }
  }, [validateRegex, onInteraction, setHasUnsavedChanges, activeSessionId, queueSaveRegexState]);

  // Handle negative content regex change
  const handleNegativeContentRegexChange = useCallback((value: string) => {
    setNegativeContentRegex(value);
    
    // Validate the regex pattern
    if (!validateRegex(value)) {
      setNegativeContentRegexError("Invalid regex pattern");
    } else {
      setNegativeContentRegexError(null);
    }
    
    if (onInteraction) {
      onInteraction();
    }
    
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
    
    // Use optimized save queue instead of debounced save
    if (activeSessionId) {
      queueSaveRegexState(activeSessionId);
    }
  }, [validateRegex, onInteraction, setHasUnsavedChanges, activeSessionId, queueSaveRegexState]);

  // Toggle regex active state
  const handleToggleRegexActive = useCallback((value: boolean) => {
    setIsRegexActive(value);
    
    if (onInteraction) {
      onInteraction();
    }
    
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
    
    // This is a boolean toggle, always save immediately  
    if (activeSessionId) {
      saveRegexState(activeSessionId);
      
      // Update saved state reference
      prevSavedStateRef.current = {
        ...prevSavedStateRef.current,
        isRegexActive: value
      };
      lastSaveTimeRef.current = Date.now();
    }
  }, [onInteraction, setHasUnsavedChanges, activeSessionId, saveRegexState]);

  // Generate regex from task description
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
  }, [taskDescription, isGeneratingTaskRegex, showNotification, activeSessionId]);

  // Clear all regex patterns
  const handleClearPatterns = useCallback(() => {
    setTitleRegex("");
    setContentRegex("");
    setNegativeTitleRegex("");
    setNegativeContentRegex("");
    setTitleRegexError(null);
    setContentRegexError(null);
    setNegativeTitleRegexError(null);
    setNegativeContentRegexError(null);
    
    if (onInteraction) {
      onInteraction();
    }
    
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
    
    showNotification({
      title: "Regex patterns cleared",
      message: "All regex patterns have been cleared.",
      type: "success"
    });
  }, [onInteraction, setHasUnsavedChanges, showNotification]);

  // Apply regex patterns to state
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
    
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
  }, [
    handleTitleRegexChange,
    handleContentRegexChange,
    handleNegativeTitleRegexChange,
    handleNegativeContentRegexChange,
    setHasUnsavedChanges
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
    saveRegexState,
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
    saveRegexState,
    validateRegex,
    reset
  ]);
} 