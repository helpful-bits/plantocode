"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { useNotification } from '@/lib/contexts/notification-context';
import { useBackgroundJob } from '@/lib/contexts/background-jobs-context';
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
  // Get notification context
  const { showNotification } = useNotification();
  
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

  // Create debounced interaction handler for regular inputs
  const debouncedInteraction = useMemo(
    () => debounce(() => {
      if (onInteraction) {
        console.log('[RegexState] Triggering debounced interaction for regex changes');
        onInteraction();
      }
    }, 1000), // 1 second debounce for text inputs
    [onInteraction]
  );
  
  // Create debounced interaction handler for bulk operations
  const debouncedBulkInteraction = useMemo(
    () => debounce(() => {
      if (onInteraction) {
        console.log('[RegexState] Triggering debounced bulk interaction for regex pattern application');
        onInteraction();
      }
    }, 2000), // 2 second debounce for bulk operations
    [onInteraction]
  );

  // Handler for title regex changes
  const handleTitleRegexChange = useCallback((value: string) => {
    setTitleRegex(value);
    const error = validateRegex(value);
    setTitleRegexError(error);

    // Notify parent component of changes with debounce
    debouncedInteraction();
  }, [validateRegex, debouncedInteraction]);

  // Handler for content regex changes
  const handleContentRegexChange = useCallback((value: string) => {
    setContentRegex(value);
    const error = validateRegex(value);
    setContentRegexError(error);

    // Notify parent component of changes with debounce
    debouncedInteraction();
  }, [validateRegex, debouncedInteraction]);

  // Handler for negative title regex changes
  const handleNegativeTitleRegexChange = useCallback((value: string) => {
    setNegativeTitleRegex(value);
    const error = validateRegex(value);
    setNegativeTitleRegexError(error);

    // Notify parent component of changes with debounce
    debouncedInteraction();
  }, [validateRegex, debouncedInteraction]);

  // Handler for negative content regex changes
  const handleNegativeContentRegexChange = useCallback((value: string) => {
    setNegativeContentRegex(value);
    const error = validateRegex(value);
    setNegativeContentRegexError(error);

    // Notify parent component of changes with debounce
    debouncedInteraction();
  }, [validateRegex, debouncedInteraction]);

  // Toggle regex active state
  const handleToggleRegexActive = useCallback((newValue?: boolean) => {
    setIsRegexActive(prev => typeof newValue === 'boolean' ? newValue : !prev);
    
    // Notify parent component of changes - no debounce for toggle actions
    if (onInteraction) {
      onInteraction();
    }
  }, [onInteraction]);

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
      setIsRegexActive(true);
      console.log('[RegexState] Applied regex patterns, activating regex mode');
    }
    
    // Reset the generating state
    setIsGeneratingTaskRegex(false);
    setGeneratingRegexJobId(null);
    
    // Use debounced bulk interaction since multiple regex changes may be applied at once
    debouncedBulkInteraction();
  }, [
    handleTitleRegexChange,
    handleContentRegexChange,
    handleNegativeTitleRegexChange,
    handleNegativeContentRegexChange,
    debouncedBulkInteraction
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
    
    // Notify parent component of changes - no debounce for clear action
    if (onInteraction) {
      onInteraction();
    }
  }, [
    onInteraction
  ]);

  // Helper function to extract regex patterns using regex
  const extractAndApplyPatterns = useCallback((response: string) => {
    const patterns: Record<string, string> = {};
    
    // Extract title regex
    const titleMatch = response.match(/title(?:\s+regex)?:\s*`([^`]+)`|title(?:\s+regex)?:\s*"([^"]+)"|title(?:\s+regex)?:\s*\/([^\/]+)\//i);
    if (titleMatch) {
      patterns.titlePattern = titleMatch[1] || titleMatch[2] || titleMatch[3];
    }
    
    // Extract content regex
    const contentMatch = response.match(/content(?:\s+regex)?:\s*`([^`]+)`|content(?:\s+regex)?:\s*"([^"]+)"|content(?:\s+regex)?:\s*\/([^\/]+)\//i);
    if (contentMatch) {
      patterns.contentPattern = contentMatch[1] || contentMatch[2] || contentMatch[3];
    }
    
    // Extract negative title regex
    const negTitleMatch = response.match(/negative(?:\s+title)?(?:\s+regex)?:\s*`([^`]+)`|negative(?:\s+title)?(?:\s+regex)?:\s*"([^"]+)"|negative(?:\s+title)?(?:\s+regex)?:\s*\/([^\/]+)\//i);
    if (negTitleMatch) {
      patterns.negativeTitlePattern = negTitleMatch[1] || negTitleMatch[2] || negTitleMatch[3];
    }
    
    // Extract negative content regex
    const negContentMatch = response.match(/negative(?:\s+content)?(?:\s+regex)?:\s*`([^`]+)`|negative(?:\s+content)?(?:\s+regex)?:\s*"([^"]+)"|negative(?:\s+content)?(?:\s+regex)?:\s*\/([^\/]+)\//i);
    if (negContentMatch) {
      patterns.negativeContentPattern = negContentMatch[1] || negContentMatch[2] || negContentMatch[3];
    }
    
    // Apply the extracted patterns
    if (Object.keys(patterns).length > 0) {
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
  
  // Use the useBackgroundJob hook to monitor the regex generation job
  const regexJob = useBackgroundJob(generatingRegexJobId);
  
  // Effect to handle job status changes
  useEffect(() => {
    // Skip if no job ID or not in generating state
    if (!generatingRegexJobId || !isGeneratingTaskRegex) {
      return;
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