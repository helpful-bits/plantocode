"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { generateRegexPatternsAction } from "@core/actions/generate-regex-actions";
import { useNotification } from '@core/lib/contexts/notification-context';
import { useBackgroundJob } from '@core/lib/contexts/background-jobs-context';
import { useSessionContext } from '@core/lib/contexts/session-context';

interface UseRegexStateProps {
  activeSessionId: string | null;
  taskDescription: string;
  isSwitchingSession?: boolean;
}

export function useRegexState({
  activeSessionId,
  taskDescription,
  isSwitchingSession = false
}: UseRegexStateProps) {
  // Get session context
  const sessionContext = useSessionContext();
  // Get notification context
  const { showNotification } = useNotification();

  // Constants
  const REGEX_MAX_LENGTH = 500;

  // Error states for regex validation - these are UI-only state, not persisted
  const [titleRegexError, setTitleRegexError] = useState<string | null>(null);
  const [contentRegexError, setContentRegexError] = useState<string | null>(null);
  const [negativeTitleRegexError, setNegativeTitleRegexError] = useState<string | null>(null);
  const [negativeContentRegexError, setNegativeContentRegexError] = useState<string | null>(null);

  // State for regex generation via AI - UI-only state
  const [isGeneratingTaskRegex, setIsGeneratingTaskRegex] = useState(false);
  const [generatingRegexJobId, setGeneratingRegexJobId] = useState<string | null>(null);
  const [regexGenerationError, setRegexGenerationError] = useState<string | null>(null);

  // Local state for immediate UI feedback
  const [internalTitleRegex, setInternalTitleRegex] = useState<string>('');
  const [internalContentRegex, setInternalContentRegex] = useState<string>('');
  const [internalNegativeTitleRegex, setInternalNegativeTitleRegex] = useState<string>('');
  const [internalNegativeContentRegex, setInternalNegativeContentRegex] = useState<string>('');
  const [internalIsRegexActive, setInternalIsRegexActive] = useState<boolean>(true);

  // Debounce timers for each regex field
  const titleRegexDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const contentRegexDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const negativeTitleRegexDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const negativeContentRegexDebounceRef = useRef<NodeJS.Timeout | null>(null);

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

  // Sync local state from context whenever context changes
  useEffect(() => {
    if (isSwitchingSession) {
      console.log('[RegexState] Switching session, skipping state update');
      return;
    }

    if (!sessionContext.currentSession) {
      console.log('[RegexState] No current session, using defaults');
      setInternalTitleRegex('');
      setInternalContentRegex('');
      setInternalNegativeTitleRegex('');
      setInternalNegativeContentRegex('');
      setInternalIsRegexActive(true);
      return;
    }

    console.log('[RegexState] Syncing local state from context');

    // Only update if values are different to prevent render loops
    if (internalTitleRegex !== (sessionContext.currentSession.titleRegex || '')) {
      setInternalTitleRegex(sessionContext.currentSession.titleRegex || '');
    }

    if (internalContentRegex !== (sessionContext.currentSession.contentRegex || '')) {
      setInternalContentRegex(sessionContext.currentSession.contentRegex || '');
    }

    if (internalNegativeTitleRegex !== (sessionContext.currentSession.negativeTitleRegex || '')) {
      setInternalNegativeTitleRegex(sessionContext.currentSession.negativeTitleRegex || '');
    }

    if (internalNegativeContentRegex !== (sessionContext.currentSession.negativeContentRegex || '')) {
      setInternalNegativeContentRegex(sessionContext.currentSession.negativeContentRegex || '');
    }

    if (internalIsRegexActive !== (sessionContext.currentSession.isRegexActive ?? true)) {
      setInternalIsRegexActive(sessionContext.currentSession.isRegexActive ?? true);
    }
  }, [
    sessionContext.currentSession,
    isSwitchingSession,
    internalTitleRegex,
    internalContentRegex,
    internalNegativeTitleRegex,
    internalNegativeContentRegex,
    internalIsRegexActive
  ]);

  // Handler for title regex changes - now updates local state immediately and debounces context updates
  const handleTitleRegexChange = useCallback((value: string) => {
    // Update local state immediately for responsive UI
    setInternalTitleRegex(value);
    
    // Update validation error state immediately
    const error = validateRegex(value);
    setTitleRegexError(error);

    // Debounce the context update
    if (titleRegexDebounceRef.current) {
      clearTimeout(titleRegexDebounceRef.current);
    }
    
    titleRegexDebounceRef.current = setTimeout(() => {
      if (sessionContext.activeSessionId) { // Ensure session exists
        sessionContext.updateCurrentSessionFields({ 
          titleRegex: value 
        });
      }
    }, 500);
  }, [validateRegex, sessionContext]);

  // Handler for content regex changes - now updates local state immediately and debounces context updates
  const handleContentRegexChange = useCallback((value: string) => {
    // Update local state immediately for responsive UI
    setInternalContentRegex(value);
    
    // Update validation error state immediately
    const error = validateRegex(value);
    setContentRegexError(error);

    // Debounce the context update
    if (contentRegexDebounceRef.current) {
      clearTimeout(contentRegexDebounceRef.current);
    }
    
    contentRegexDebounceRef.current = setTimeout(() => {
      if (sessionContext.activeSessionId) { // Ensure session exists
        sessionContext.updateCurrentSessionFields({ 
          contentRegex: value 
        });
      }
    }, 500);
  }, [validateRegex, sessionContext]);

  // Handler for negative title regex changes - now updates local state immediately and debounces context updates
  const handleNegativeTitleRegexChange = useCallback((value: string) => {
    // Update local state immediately for responsive UI
    setInternalNegativeTitleRegex(value);
    
    // Update validation error state immediately
    const error = validateRegex(value);
    setNegativeTitleRegexError(error);

    // Debounce the context update
    if (negativeTitleRegexDebounceRef.current) {
      clearTimeout(negativeTitleRegexDebounceRef.current);
    }
    
    negativeTitleRegexDebounceRef.current = setTimeout(() => {
      if (sessionContext.activeSessionId) { // Ensure session exists
        sessionContext.updateCurrentSessionFields({ 
          negativeTitleRegex: value 
        });
      }
    }, 500);
  }, [validateRegex, sessionContext]);

  // Handler for negative content regex changes - now updates local state immediately and debounces context updates
  const handleNegativeContentRegexChange = useCallback((value: string) => {
    // Update local state immediately for responsive UI
    setInternalNegativeContentRegex(value);
    
    // Update validation error state immediately
    const error = validateRegex(value);
    setNegativeContentRegexError(error);

    // Debounce the context update
    if (negativeContentRegexDebounceRef.current) {
      clearTimeout(negativeContentRegexDebounceRef.current);
    }
    
    negativeContentRegexDebounceRef.current = setTimeout(() => {
      if (sessionContext.activeSessionId) { // Ensure session exists
        sessionContext.updateCurrentSessionFields({ 
          negativeContentRegex: value 
        });
      }
    }, 500);
  }, [validateRegex, sessionContext]);

  // Toggle regex active state - now updates local state immediately and context directly
  const handleToggleRegexActive = useCallback((newValue?: boolean) => {
    // Get current value from local state
    const currentValue = internalIsRegexActive;
    // Determine new value
    const nextValue = typeof newValue === 'boolean' ? newValue : !currentValue;

    // Skip the update if the value is already set
    if (nextValue === currentValue) {
      console.log('[RegexState] Skipping redundant isRegexActive update');
      return;
    }

    // Update local state immediately
    setInternalIsRegexActive(nextValue);

    // Update context directly with properly typed object
    sessionContext.updateCurrentSessionFields({
      isRegexActive: nextValue
    });
  }, [internalIsRegexActive, sessionContext]);

  // Apply regex patterns to state - now updates local state immediately and context
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
    // Update local state for immediate UI feedback
    let patternsCount = 0;
    
    if (titlePattern !== undefined) {
      setInternalTitleRegex(titlePattern);
      const error = validateRegex(titlePattern);
      setTitleRegexError(error);
      patternsCount++;
    }
    
    if (contentPattern !== undefined) {
      setInternalContentRegex(contentPattern);
      const error = validateRegex(contentPattern);
      setContentRegexError(error);
      patternsCount++;
    }
    
    if (negativeTitlePattern !== undefined) {
      setInternalNegativeTitleRegex(negativeTitlePattern);
      const error = validateRegex(negativeTitlePattern);
      setNegativeTitleRegexError(error);
      patternsCount++;
    }
    
    if (negativeContentPattern !== undefined) {
      setInternalNegativeContentRegex(negativeContentPattern);
      const error = validateRegex(negativeContentPattern);
      setNegativeContentRegexError(error);
      patternsCount++;
    }

    // Update regex active state if we have patterns
    if (patternsCount > 0) {
      setInternalIsRegexActive(true);
    }

    // Create a typed update object for context
    const updateFields: {
      isRegexActive?: boolean;
      titleRegex?: string;
      contentRegex?: string;
      negativeTitleRegex?: string;
      negativeContentRegex?: string;
    } = {};

    // Only add fields that need updating to minimize context changes
    if (patternsCount > 0) {
      updateFields.isRegexActive = true;
    }
    
    if (titlePattern !== undefined) updateFields.titleRegex = titlePattern;
    if (contentPattern !== undefined) updateFields.contentRegex = contentPattern;
    if (negativeTitlePattern !== undefined) updateFields.negativeTitleRegex = negativeTitlePattern;
    if (negativeContentPattern !== undefined) updateFields.negativeContentRegex = negativeContentPattern;

    // Update context with all changes at once if we have patterns
    if (patternsCount > 0 && sessionContext.activeSessionId && Object.keys(updateFields).length > 0) {
      console.log('[RegexState] Applied regex patterns, activating regex mode');

      // Use type assertion to resolve TypeScript error
      sessionContext.updateCurrentSessionFields(updateFields as {
        titleRegex: string;
        contentRegex: string;
        negativeTitleRegex: string;
        negativeContentRegex: string;
        isRegexActive: boolean;
      });
    }

    // Reset the generating state
    setIsGeneratingTaskRegex(false);
    setGeneratingRegexJobId(null);
  }, [validateRegex, sessionContext]);

  // Clear all patterns - now updates local state immediately and context
  const handleClearPatterns = useCallback(() => {
    // Update local state immediately for responsive UI
    setInternalTitleRegex("");
    setInternalContentRegex("");
    setInternalNegativeTitleRegex("");
    setInternalNegativeContentRegex("");
    
    // Update context with empty values
    if (sessionContext.activeSessionId) {
      // All fields are required in the Session type
      sessionContext.updateCurrentSessionFields({
        titleRegex: "",
        contentRegex: "",
        negativeTitleRegex: "",
        negativeContentRegex: ""
      });
    }

    // Clear error states (UI-only)
    setTitleRegexError(null);
    setContentRegexError(null);
    setNegativeTitleRegexError(null);
    setNegativeContentRegexError(null);
  }, [sessionContext]);

  // Reset function to clear state
  const reset = useCallback(() => {
    console.log('[RegexState] Resetting regex state');

    // Reset local state immediately
    setInternalTitleRegex("");
    setInternalContentRegex("");
    setInternalNegativeTitleRegex("");
    setInternalNegativeContentRegex("");
    setInternalIsRegexActive(true);

    // Reset patterns in context if we have an active session
    if (sessionContext.activeSessionId) {
      sessionContext.updateCurrentSessionFields({
        titleRegex: "",
        contentRegex: "",
        negativeTitleRegex: "",
        negativeContentRegex: "",
        isRegexActive: true
      });
    }

    // Reset validation errors (UI-only)
    setTitleRegexError(null);
    setContentRegexError(null);
    setNegativeTitleRegexError(null);
    setNegativeContentRegexError(null);

    // Reset regex generation state (UI-only)
    setIsGeneratingTaskRegex(false);
    setGeneratingRegexJobId(null);
    setRegexGenerationError(null);
  }, [sessionContext]);
  
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
  
  // Clean up debounce timers on unmount
  useEffect(() => {
    return () => {
      if (titleRegexDebounceRef.current) {
        clearTimeout(titleRegexDebounceRef.current);
      }
      if (contentRegexDebounceRef.current) {
        clearTimeout(contentRegexDebounceRef.current);
      }
      if (negativeTitleRegexDebounceRef.current) {
        clearTimeout(negativeTitleRegexDebounceRef.current);
      }
      if (negativeContentRegexDebounceRef.current) {
        clearTimeout(negativeContentRegexDebounceRef.current);
      }
    };
  }, []);
  
  // Use the useBackgroundJob hook to monitor the regex generation job
  const regexJob = useBackgroundJob(generatingRegexJobId);
  
  // Effect to handle job status changes
  const handleJobStatusChanges = useCallback(() => {
    // Skip if no job ID or not in generating state
    if (!generatingRegexJobId || !isGeneratingTaskRegex) {
      return;
    }

    // Log the current job state to help with debugging
    if (regexJob) {
      console.log(`[RegexState] Regex job status: ${regexJob.status}, job:`, regexJob.job);
      // Additional logging to debug the job structure
      if (regexJob.job) {
        console.log(`[RegexState] Job metadata:`, regexJob.job.metadata);
      }
    }

    // If job is completed, process the result
    if (regexJob && regexJob.status === 'completed') {
      console.log('[RegexState] Regex generation job completed, processing results');

      try {
        // We can now access metadata directly from regexJob thanks to our hook update
        // Try both paths to find regexPatterns - direct metadata or via job property
        const metadata = regexJob.metadata || regexJob.job?.metadata;
        console.log('[RegexState] Job metadata for pattern extraction:', metadata);

        const regexPatterns = metadata?.regexPatterns;

        if (regexPatterns) {
          console.log('[RegexState] Found structured regex patterns in job metadata:', regexPatterns);

          // Prepare patterns for our state
          const patterns = {
            titlePattern: regexPatterns.titleRegex || '',
            contentPattern: regexPatterns.contentRegex || '',
            negativeTitlePattern: regexPatterns.negativeTitleRegex || '',
            negativeContentPattern: regexPatterns.negativeContentRegex || ''
          };

          // Count non-empty patterns
          const patternsFound = Object.values(patterns).filter(Boolean).length;

          if (patternsFound > 0) {
            console.log(`[RegexState] Successfully found ${patternsFound} patterns in metadata`);

            // Apply the patterns we found
            applyRegexPatterns(patterns);

            // Emit event to switch the filter mode to regex
            const filterModeChangeEvent = new CustomEvent('setFilterModeToRegex');
            window.dispatchEvent(filterModeChangeEvent);
          } else {
            console.error('[RegexState] No regex patterns found in metadata');
            setIsGeneratingTaskRegex(false);

            // Only set the error message if the regex panel is open
            if (regexJob.job?.metadata?.openRegexPanel) {
              setRegexGenerationError("No valid regex patterns found");
            } else {
              // Clear any previous error
              setRegexGenerationError(null);
            }
          }
        } else {
          console.warn('[RegexState] No regexPatterns found in job metadata');
          setIsGeneratingTaskRegex(false);

          // Don't set error message for metadata structure issues
          setRegexGenerationError(null);
        }
      } catch (error) {
        console.error('[RegexState] Error processing regex job metadata:', error);
        setIsGeneratingTaskRegex(false);
        setRegexGenerationError(error instanceof Error ? error.message : "Failed to process regex patterns");
      }
    }

    // If job failed, show error
    if (regexJob && (regexJob.status === 'failed' || regexJob.status === 'canceled')) {
      console.error('[RegexState] Regex generation job failed:', regexJob.errorMessage);
      setIsGeneratingTaskRegex(false);
      setRegexGenerationError(regexJob.errorMessage || "Failed to generate regex patterns");
    }
  }, [
    regexJob,
    generatingRegexJobId,
    isGeneratingTaskRegex,
    applyRegexPatterns,
    setIsGeneratingTaskRegex,
    setRegexGenerationError
  ]);

  // Apply the callback in useEffect
  useEffect(() => {
    handleJobStatusChanges();
  }, [handleJobStatusChanges, internalContentRegex, internalIsRegexActive, internalNegativeContentRegex, internalNegativeTitleRegex, internalTitleRegex]);

  // Generate regex from task description - stabilized with useCallback
  const handleGenerateRegexFromTask = useCallback(async () => {
    if (!taskDescription.trim()) {
      // Skip notifying if task description is empty
      console.warn('[RegexState] Cannot generate regex: Missing task description');
      return;
    }

    if (isGeneratingTaskRegex) {
      // Skip notifying if already generating
      console.warn('[RegexState] Already generating regex, ignoring request');
      return;
    }

    // Validate that activeSessionId is a string if it's used in the action
    if (activeSessionId !== null && typeof activeSessionId !== 'string') {
      console.error(`[RegexState] Invalid activeSessionId type: ${typeof activeSessionId}, value:`, activeSessionId);
      return;
    }

    setIsGeneratingTaskRegex(true);
    setRegexGenerationError("");

    try {
      // Check if we have an active session ID
      if (!activeSessionId) {
        throw new Error("Active session required to generate regex patterns.");
      }

      const result = await generateRegexPatternsAction(taskDescription, undefined, undefined, activeSessionId);

      if (result.isSuccess && result.data) {
        if (typeof result.data === 'object' && 'jobId' in result.data) {
          setGeneratingRegexJobId(result.data.jobId);
          console.log('[RegexState] Started regex generation job:', result.data.jobId);
        }
      } else {
        throw new Error(result.message || "Failed to start regex generation.");
      }
    } catch (error) {
      console.error("[RegexState] Error generating regex patterns:", error);
      setIsGeneratingTaskRegex(false);
      setRegexGenerationError(error instanceof Error ? error.message : "An unknown error occurred");
    }
  }, [
    taskDescription,
    isGeneratingTaskRegex,
    activeSessionId
  ]);

  return useMemo(() => ({
    // Return internal state for UI - this makes input responsive
    titleRegex: internalTitleRegex,
    contentRegex: internalContentRegex,
    negativeTitleRegex: internalNegativeTitleRegex,
    negativeContentRegex: internalNegativeContentRegex,
    isRegexActive: internalIsRegexActive,
    
    // UI-only state
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
    // Internal state for UI
    internalTitleRegex,
    internalContentRegex,
    internalNegativeTitleRegex,
    internalNegativeContentRegex,
    internalIsRegexActive,
    
    // Local UI state
    isGeneratingTaskRegex,
    regexGenerationError,
    titleRegexError,
    contentRegexError,
    negativeTitleRegexError,
    negativeContentRegexError,
    generatingRegexJobId,
    
    // Actions
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