"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { useNotification } from '@/lib/contexts/notification-context';
import { useBackgroundJob } from '@/lib/contexts/background-jobs-context';
import { useSessionContext } from '@/lib/contexts/session-context';

interface UseRegexStateProps {
  activeSessionId: string | null;
  taskDescription: string;
  onInteraction?: () => void;
  isSwitchingSession?: boolean;
}

export function useRegexState({
  activeSessionId,
  taskDescription,
  onInteraction,
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

  // Direct interaction handling without debouncing
  const triggerInteraction = useCallback(() => {
    if (isSwitchingSession) {
      console.log('[RegexState] Suppressed interaction: session switch in progress');
      return;
    }

    if (onInteraction) {
      console.log('[RegexState] Triggering interaction for regex changes');
      onInteraction();
    }
  }, [onInteraction, isSwitchingSession]);

  // Internal state for regex patterns
  const [internalTitleRegex, setInternalTitleRegex] = useState<string>('');
  const [internalContentRegex, setInternalContentRegex] = useState<string>('');
  const [internalNegativeTitleRegex, setInternalNegativeTitleRegex] = useState<string>('');
  const [internalNegativeContentRegex, setInternalNegativeContentRegex] = useState<string>('');
  const [internalIsRegexActive, setInternalIsRegexActive] = useState<boolean>(true);

  // Initialize internal state from session when session changes
  useEffect(() => {
    // Handle the case when session is transitioning or currentSession is null
    if (isSwitchingSession || !sessionContext.currentSession) {
      console.log('[RegexState] Session transition or null session detected, resetting state');
      // Reset all internal state to defaults
      setInternalTitleRegex('');
      setInternalContentRegex('');
      setInternalNegativeTitleRegex('');
      setInternalNegativeContentRegex('');
      setInternalIsRegexActive(true);
      return;
    }

    // If we have a valid session, initialize from it
    console.log('[RegexState] Initializing internal state from session');

    // Only update if the values have changed to prevent loops
    if (internalTitleRegex !== (sessionContext.currentSession?.titleRegex || '')) {
      setInternalTitleRegex(sessionContext.currentSession?.titleRegex || '');
    }

    if (internalContentRegex !== (sessionContext.currentSession?.contentRegex || '')) {
      setInternalContentRegex(sessionContext.currentSession?.contentRegex || '');
    }

    if (internalNegativeTitleRegex !== (sessionContext.currentSession?.negativeTitleRegex || '')) {
      setInternalNegativeTitleRegex(sessionContext.currentSession?.negativeTitleRegex || '');
    }

    if (internalNegativeContentRegex !== (sessionContext.currentSession?.negativeContentRegex || '')) {
      setInternalNegativeContentRegex(sessionContext.currentSession?.negativeContentRegex || '');
    }

    if (internalIsRegexActive !== (sessionContext.currentSession?.isRegexActive ?? true)) {
      setInternalIsRegexActive(sessionContext.currentSession?.isRegexActive ?? true);
    }
  }, [
    sessionContext.currentSession,
    sessionContext.activeSessionId, // React to changes in activeSessionId
    isSwitchingSession,
    internalTitleRegex,
    internalContentRegex,
    internalNegativeTitleRegex,
    internalNegativeContentRegex,
    internalIsRegexActive
  ]);

  // Handler for title regex changes - now updates internal state
  const handleTitleRegexChange = useCallback((value: string) => {
    // Skip update if the value is the same
    if (value === internalTitleRegex) {
      return;
    }

    // Update internal state
    setInternalTitleRegex(value);

    // Validate for UI feedback only
    const error = validateRegex(value);
    setTitleRegexError(error);

    // Notify parent component of changes
    triggerInteraction();
  }, [validateRegex, triggerInteraction, internalTitleRegex]);

  // Handler for content regex changes - now updates internal state
  const handleContentRegexChange = useCallback((value: string) => {
    // Skip update if the value is the same
    if (value === internalContentRegex) {
      return;
    }

    // Update internal state
    setInternalContentRegex(value);

    // Validate for UI feedback only
    const error = validateRegex(value);
    setContentRegexError(error);

    // Notify parent component of changes
    triggerInteraction();
  }, [validateRegex, triggerInteraction, internalContentRegex]);

  // Handler for negative title regex changes - now updates internal state
  const handleNegativeTitleRegexChange = useCallback((value: string) => {
    // Skip update if the value is the same
    if (value === internalNegativeTitleRegex) {
      return;
    }

    // Update internal state
    setInternalNegativeTitleRegex(value);

    // Validate for UI feedback only
    const error = validateRegex(value);
    setNegativeTitleRegexError(error);

    // Notify parent component of changes
    triggerInteraction();
  }, [validateRegex, triggerInteraction, internalNegativeTitleRegex]);

  // Handler for negative content regex changes - now updates internal state
  const handleNegativeContentRegexChange = useCallback((value: string) => {
    // Skip update if the value is the same
    if (value === internalNegativeContentRegex) {
      return;
    }

    // Update internal state
    setInternalNegativeContentRegex(value);

    // Validate for UI feedback only
    const error = validateRegex(value);
    setNegativeContentRegexError(error);

    // Notify parent component of changes
    triggerInteraction();
  }, [validateRegex, triggerInteraction, internalNegativeContentRegex]);

  // Toggle regex active state - now updates internal state
  const handleToggleRegexActive = useCallback((newValue?: boolean) => {
    // Get current value from internal state
    const currentValue = internalIsRegexActive;
    // Determine new value
    const nextValue = typeof newValue === 'boolean' ? newValue : !currentValue;

    // Skip the update if the value is already set
    if (nextValue === currentValue) {
      console.log('[RegexState] Skipping redundant isRegexActive update');
      return;
    }

    // Update internal state
    setInternalIsRegexActive(nextValue);

    // Notify parent component of changes
    if (onInteraction) {
      onInteraction();
    }
  }, [onInteraction, internalIsRegexActive]);

  // Apply regex patterns to state - now updates internal state
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
    // Count of non-empty patterns
    let patternsCount = 0;

    // Only update non-empty patterns
    if (titlePattern) {
      handleTitleRegexChange(titlePattern);
      patternsCount++;
    }
    if (contentPattern) {
      handleContentRegexChange(contentPattern);
      patternsCount++;
    }
    if (negativeTitlePattern) {
      handleNegativeTitleRegexChange(negativeTitlePattern);
      patternsCount++;
    }
    if (negativeContentPattern) {
      handleNegativeContentRegexChange(negativeContentPattern);
      patternsCount++;
    }

    // Ensure regex is active if at least one pattern was provided
    if (patternsCount > 0) {
      // Update internal regex active state
      setInternalIsRegexActive(true);
      console.log('[RegexState] Applied regex patterns, activating regex mode');
    }

    // Reset the generating state
    setIsGeneratingTaskRegex(false);
    setGeneratingRegexJobId(null);

    // Notify parent of changes
    triggerInteraction();
  }, [
    handleTitleRegexChange,
    handleContentRegexChange,
    handleNegativeTitleRegexChange,
    handleNegativeContentRegexChange,
    triggerInteraction
  ]);

  // Clear all patterns - now updates internal state
  const handleClearPatterns = useCallback(() => {
    // Update internal state with empty values
    setInternalTitleRegex("");
    setInternalContentRegex("");
    setInternalNegativeTitleRegex("");
    setInternalNegativeContentRegex("");

    // Clear error states (UI-only)
    setTitleRegexError(null);
    setContentRegexError(null);
    setNegativeTitleRegexError(null);
    setNegativeContentRegexError(null);

    // Notify parent component of changes
    if (onInteraction) {
      onInteraction();
    }
  }, [onInteraction]);


  // Reset function to clear state
  const reset = useCallback(() => {
    console.log('[RegexState] Resetting regex state');

    // Reset internal patterns state
    setInternalTitleRegex("");
    setInternalContentRegex("");
    setInternalNegativeTitleRegex("");
    setInternalNegativeContentRegex("");
    setInternalIsRegexActive(true); // Reset regex active state to default (true)

    // Reset validation errors (UI-only)
    setTitleRegexError(null);
    setContentRegexError(null);
    setNegativeTitleRegexError(null);
    setNegativeContentRegexError(null);

    // Reset regex generation state (UI-only)
    setIsGeneratingTaskRegex(false);
    setGeneratingRegexJobId(null);
    setRegexGenerationError(null);
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
  }, [handleJobStatusChanges]);

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
    // State - now using internal state values
    titleRegex: internalTitleRegex,
    contentRegex: internalContentRegex,
    negativeTitleRegex: internalNegativeTitleRegex,
    negativeContentRegex: internalNegativeContentRegex,
    isRegexActive: internalIsRegexActive,
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
    // Internal state values
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