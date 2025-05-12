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

  // Helper function to extract regex patterns using regex
  const extractAndApplyPatterns = useCallback((response: string) => {
    const patterns: Record<string, string> = {};

    console.log('[RegexState] Attempting to extract patterns from text, length:', response.length);

    // Extract title regex - improved format matching
    const titleMatch = response.match(/title(?:\s+regex)?[:\s=]+["`']?([^`"',\n]+)[`"']?|title(?:\s+regex)?[:\s=]+\/([^\/\n]+)\/[gim]*/i);
    if (titleMatch) {
      patterns.titlePattern = titleMatch[1] || titleMatch[2];
      console.log('[RegexState] Found title regex:', patterns.titlePattern);
    }

    // Extract content regex - improved format matching
    const contentMatch = response.match(/content(?:\s+regex)?[:\s=]+["`']?([^`"',\n]+)[`"']?|content(?:\s+regex)?[:\s=]+\/([^\/\n]+)\/[gim]*/i);
    if (contentMatch) {
      patterns.contentPattern = contentMatch[1] || contentMatch[2];
      console.log('[RegexState] Found content regex:', patterns.contentPattern);
    }

    // Extract negative title regex - improved format matching
    const negTitleMatch = response.match(/negative(?:\s+title)?(?:\s+regex)?[:\s=]+["`']?([^`"',\n]+)[`"']?|negative(?:\s+title)?(?:\s+regex)?[:\s=]+\/([^\/\n]+)\/[gim]*/i);
    if (negTitleMatch) {
      patterns.negativeTitlePattern = negTitleMatch[1] || negTitleMatch[2];
      console.log('[RegexState] Found negative title regex:', patterns.negativeTitlePattern);
    }

    // Extract negative content regex - improved format matching
    const negContentMatch = response.match(/negative(?:\s+content)?(?:\s+regex)?[:\s=]+["`']?([^`"',\n]+)[`"']?|negative(?:\s+content)?(?:\s+regex)?[:\s=]+\/([^\/\n]+)\/[gim]*/i);
    if (negContentMatch) {
      patterns.negativeContentPattern = negContentMatch[1] || negContentMatch[2];
      console.log('[RegexState] Found negative content regex:', patterns.negativeContentPattern);
    }

    // Try to find patterns in regular structured text if no matches found above
    if (Object.keys(patterns).filter(k => patterns[k] !== undefined).length === 0) {
      console.log('[RegexState] No patterns found with primary regex, trying lines with ":" format');

      // Extract patterns from lines that look like "Pattern name: pattern"
      const lines = response.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.toLowerCase().startsWith('title') && trimmedLine.includes(':')) {
          const patternText = trimmedLine.split(':')[1].trim();
          if (patternText && !patterns.titlePattern) {
            patterns.titlePattern = patternText.replace(/^["'`]|["'`]$/g, '');
            console.log('[RegexState] Found title regex from line:', patterns.titlePattern);
          }
        }

        if (trimmedLine.toLowerCase().startsWith('content') && trimmedLine.includes(':')) {
          const patternText = trimmedLine.split(':')[1].trim();
          if (patternText && !patterns.contentPattern) {
            patterns.contentPattern = patternText.replace(/^["'`]|["'`]$/g, '');
            console.log('[RegexState] Found content regex from line:', patterns.contentPattern);
          }
        }

        if (trimmedLine.toLowerCase().includes('negative') &&
            trimmedLine.toLowerCase().includes('title') &&
            trimmedLine.includes(':')) {
          const patternText = trimmedLine.split(':')[1].trim();
          if (patternText && !patterns.negativeTitlePattern) {
            patterns.negativeTitlePattern = patternText.replace(/^["'`]|["'`]$/g, '');
            console.log('[RegexState] Found negative title regex from line:', patterns.negativeTitlePattern);
          }
        }

        if (trimmedLine.toLowerCase().includes('negative') &&
            trimmedLine.toLowerCase().includes('content') &&
            trimmedLine.includes(':')) {
          const patternText = trimmedLine.split(':')[1].trim();
          if (patternText && !patterns.negativeContentPattern) {
            patterns.negativeContentPattern = patternText.replace(/^["'`]|["'`]$/g, '');
            console.log('[RegexState] Found negative content regex from line:', patterns.negativeContentPattern);
          }
        }
      }
    }

    // Log the final extraction results
    const patternsFound = Object.keys(patterns).filter(k => patterns[k] !== undefined).length;
    console.log(`[RegexState] Extracted ${patternsFound} patterns from text`);

    // Apply the extracted patterns
    if (Object.keys(patterns).filter(k => patterns[k] !== undefined).length > 0) {
      applyRegexPatterns(patterns);

      // Show success notification
      showNotification({
        title: "Regex patterns extracted",
        message: "Patterns applied and regex filtering activated.",
        type: "success"
      });
    } else {
      setIsGeneratingTaskRegex(false);
      setRegexGenerationError("Could not extract regex patterns from AI response");
    }
  }, [
    applyRegexPatterns,
    setIsGeneratingTaskRegex,
    setRegexGenerationError,
    showNotification
  ]);

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
  useEffect(() => {
    // Skip if no job ID or not in generating state
    if (!generatingRegexJobId || !isGeneratingTaskRegex) {
      return;
    }

    // Log the current job state to help with debugging
    if (regexJob) {
      console.log(`[RegexState] Regex job status: ${regexJob.status}, response length: ${regexJob.response ? (typeof regexJob.response === 'string' ? regexJob.response.length : 'non-string') : 'none'}`);
    }

    // If job is completed, process the result
    if (regexJob && regexJob.status === 'completed' && regexJob.response) {
      console.log('[RegexState] Regex generation job completed, processing results');

      try {
        // Try to parse the response as JSON if it's a string
        if (typeof regexJob.response === 'string') {
          // Try to extract the JSON if it's in a code block
          const jsonMatch = regexJob.response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          const jsonText = jsonMatch ? jsonMatch[1] : regexJob.response;

          try {
            // Parse the JSON
            const patterns = JSON.parse(jsonText);
            console.log('[RegexState] Successfully parsed JSON patterns:', patterns);

            // Apply the patterns
            applyRegexPatterns({
              titlePattern: patterns.titleRegex || patterns.title_regex,
              contentPattern: patterns.contentRegex || patterns.content_regex,
              negativeTitlePattern: patterns.negativeTitleRegex || patterns.negative_title_regex,
              negativeContentPattern: patterns.negativeContentRegex || patterns.negative_content_regex
            });

            // Show success notification
            showNotification({
              title: "Regex patterns generated",
              message: "Patterns applied and regex filtering activated.",
              type: "success"
            });
          } catch (parseError) {
            console.error('[RegexState] Failed to parse regex job response JSON:', parseError);
            console.log('[RegexState] Attempting regex extraction as fallback, response sample:',
              regexJob.response.substring(0, 200) + (regexJob.response.length > 200 ? '...' : ''));

            // Try regex extraction as fallback
            extractAndApplyPatterns(regexJob.response);
          }
        } else {
          console.warn('[RegexState] Unexpected response type from regex job:', typeof regexJob.response);
          setIsGeneratingTaskRegex(false);
          setRegexGenerationError("Unexpected response from AI");
        }
      } catch (error) {
        console.error('[RegexState] Error processing regex job response:', error);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    regexJob,
    generatingRegexJobId,
    isGeneratingTaskRegex,
    applyRegexPatterns,
    setIsGeneratingTaskRegex,
    setRegexGenerationError,
    showNotification,
    extractAndApplyPatterns
  ]);

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
      // Check if we have an active session ID
      if (!activeSessionId) {
        throw new Error("Active session required to generate regex patterns.");
      }
      
      const result = await generateRegexPatternsAction(taskDescription, undefined, undefined, activeSessionId);
      
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
    showNotification
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