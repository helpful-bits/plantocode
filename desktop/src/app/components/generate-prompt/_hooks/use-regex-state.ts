"use client";

import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";

import { useTypedBackgroundJob } from "@/contexts/_hooks/use-typed-background-job";
import { useNotification } from "@/contexts/notification-context";
import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session";

import type { Session } from "@/types/session-types";

interface UseRegexStateProps {
  initialTitleRegex: string;
  initialContentRegex: string;
  initialNegativeTitleRegex: string;
  initialNegativeContentRegex: string;
  initialIsRegexActive: boolean;
  onStateChange?: () => void;
  taskDescription: string;
  activeSessionId?: string | null;
}

export function useRegexState({
  initialTitleRegex = "",
  initialContentRegex = "",
  initialNegativeTitleRegex = "",
  initialNegativeContentRegex = "",
  initialIsRegexActive = true,
  onStateChange,
  taskDescription,
  activeSessionId: _activeSessionId // Rename to indicate it's not currently used
}: UseRegexStateProps) {
  // Get session and notification contexts
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();
  const { showNotification } = useNotification();

  // Constants
  const REGEX_MAX_LENGTH = 500;

  // Error states for regex validation - UI-only state
  const [titleRegexError, setTitleRegexError] = useState<string | null>(null);
  const [contentRegexError, setContentRegexError] = useState<string | null>(
    null
  );
  const [negativeTitleRegexError, setNegativeTitleRegexError] = useState<
    string | null
  >(null);
  const [negativeContentRegexError, setNegativeContentRegexError] = useState<
    string | null
  >(null);

  // State for regex generation via AI - UI-only state
  const [isGeneratingTaskRegex, setIsGeneratingTaskRegex] = useState(false);
  const [generatingRegexJobId, setGeneratingRegexJobId] = useState<
    string | null
  >(null);
  const [regexGenerationError, setRegexGenerationError] = useState<
    string | null
  >(null);

  // Local state for immediate UI feedback
  const [internalTitleRegex, setInternalTitleRegex] =
    useState<string>(initialTitleRegex);
  const [internalContentRegex, setInternalContentRegex] =
    useState<string>(initialContentRegex);
  const [internalNegativeTitleRegex, setInternalNegativeTitleRegex] =
    useState<string>(initialNegativeTitleRegex);
  const [internalNegativeContentRegex, setInternalNegativeContentRegex] =
    useState<string>(initialNegativeContentRegex);
  const [internalIsRegexActive, setInternalIsRegexActive] =
    useState<boolean>(initialIsRegexActive);

  // Debounce timers for each regex field
  const titleRegexDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const contentRegexDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const negativeTitleRegexDebounceRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const negativeContentRegexDebounceRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Set initial values from props
  useEffect(() => {
    setInternalTitleRegex(initialTitleRegex);
    setInternalContentRegex(initialContentRegex);
    setInternalNegativeTitleRegex(initialNegativeTitleRegex);
    setInternalNegativeContentRegex(initialNegativeContentRegex);
    setInternalIsRegexActive(initialIsRegexActive);
  }, [
    initialTitleRegex,
    initialContentRegex,
    initialNegativeTitleRegex,
    initialNegativeContentRegex,
    initialIsRegexActive,
  ]);

  // Utility function to validate regex without crashing
  const validateRegex = useCallback((pattern: string): string | null => {
    if (!pattern || pattern.trim() === "") {
      return null;
    }

    if (pattern.length > REGEX_MAX_LENGTH) {
      return `Regex pattern is too long (max ${REGEX_MAX_LENGTH} characters)`;
    }

    try {
      new RegExp(pattern, "i");
      return null;
    } catch (e) {
      return `Invalid regex: ${(e as Error).message}`;
    }
  }, []);

  // Handle regex field changes with debounce to reduce context updates
  const handleRegexFieldChange = useCallback(
    (
      value: string,
      setter: React.Dispatch<React.SetStateAction<string>>,
      errorSetter: React.Dispatch<React.SetStateAction<string | null>>,
      debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
      fieldName: Extract<
        keyof Session,
        | "titleRegex"
        | "contentRegex"
        | "negativeTitleRegex"
        | "negativeContentRegex"
      >
    ) => {
      // Update local state immediately for responsive UI
      setter(value);

      // Validate regex pattern
      const error = validateRegex(value);
      errorSetter(error);

      // Debounce the session update
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        if (sessionState.activeSessionId) {
          sessionActions.updateCurrentSessionFields({
            [fieldName]: value,
          });
        }
        if (onStateChange) {
          onStateChange();
        }
      }, 500);
    },
    [validateRegex, sessionState.activeSessionId, sessionActions, onStateChange]
  );

  // Specialized handlers for each regex field
  const handleTitleRegexChange = useCallback(
    (value: string) => {
      handleRegexFieldChange(
        value,
        setInternalTitleRegex,
        setTitleRegexError,
        titleRegexDebounceRef,
        "titleRegex"
      );
    },
    [handleRegexFieldChange]
  );

  const handleContentRegexChange = useCallback(
    (value: string) => {
      handleRegexFieldChange(
        value,
        setInternalContentRegex,
        setContentRegexError,
        contentRegexDebounceRef,
        "contentRegex"
      );
    },
    [handleRegexFieldChange]
  );

  const handleNegativeTitleRegexChange = useCallback(
    (value: string) => {
      handleRegexFieldChange(
        value,
        setInternalNegativeTitleRegex,
        setNegativeTitleRegexError,
        negativeTitleRegexDebounceRef,
        "negativeTitleRegex"
      );
    },
    [handleRegexFieldChange]
  );

  const handleNegativeContentRegexChange = useCallback(
    (value: string) => {
      handleRegexFieldChange(
        value,
        setInternalNegativeContentRegex,
        setNegativeContentRegexError,
        negativeContentRegexDebounceRef,
        "negativeContentRegex"
      );
    },
    [handleRegexFieldChange]
  );

  // Toggle regex active state
  const handleToggleRegexActive = useCallback(
    (newValue?: boolean) => {
      const nextValue =
        typeof newValue === "boolean" ? newValue : !internalIsRegexActive;

      // Skip if the value is already set
      if (nextValue === internalIsRegexActive) {
        return;
      }

      // Update local state
      setInternalIsRegexActive(nextValue);

      // Update session
      sessionActions.updateCurrentSessionFields({
        isRegexActive: nextValue,
      });

      if (onStateChange) {
        onStateChange();
      }
    },
    [internalIsRegexActive, sessionActions, onStateChange]
  );

  // Apply regex patterns from outside the component (e.g., from job results)
  const applyRegexPatterns = useCallback(
    ({
      titlePattern,
      contentPattern,
      negativeTitlePattern,
      negativeContentPattern,
    }: {
      titlePattern?: string;
      contentPattern?: string;
      negativeTitlePattern?: string;
      negativeContentPattern?: string;
    }) => {
      // Update UI state
      const updateFields: Partial<Session> = {};

      if (titlePattern !== undefined) {
        setInternalTitleRegex(titlePattern);
        setTitleRegexError(validateRegex(titlePattern));
        updateFields.titleRegex = titlePattern;
      }

      if (contentPattern !== undefined) {
        setInternalContentRegex(contentPattern);
        setContentRegexError(validateRegex(contentPattern));
        updateFields.contentRegex = contentPattern;
      }

      if (negativeTitlePattern !== undefined) {
        setInternalNegativeTitleRegex(negativeTitlePattern);
        setNegativeTitleRegexError(validateRegex(negativeTitlePattern));
        updateFields.negativeTitleRegex = negativeTitlePattern;
      }

      if (negativeContentPattern !== undefined) {
        setInternalNegativeContentRegex(negativeContentPattern);
        setNegativeContentRegexError(validateRegex(negativeContentPattern));
        updateFields.negativeContentRegex = negativeContentPattern;
      }

      // Only update session if we have patterns
      if (Object.keys(updateFields).length > 0) {
        // Enable regex mode if we have patterns
        setInternalIsRegexActive(true);
        updateFields.isRegexActive = true;

        // Update session with all changes
        sessionActions.updateCurrentSessionFields(updateFields);

        if (onStateChange) {
          onStateChange();
        }
      }

      // Reset generation state
      setIsGeneratingTaskRegex(false);
      setGeneratingRegexJobId(null);
    },
    [validateRegex, sessionActions, onStateChange]
  );

  // Clear all patterns
  const handleClearPatterns = useCallback(() => {
    // Update UI state
    setInternalTitleRegex("");
    setInternalContentRegex("");
    setInternalNegativeTitleRegex("");
    setInternalNegativeContentRegex("");
    setTitleRegexError(null);
    setContentRegexError(null);
    setNegativeTitleRegexError(null);
    setNegativeContentRegexError(null);

    // Update session
    sessionActions.updateCurrentSessionFields({
      titleRegex: "",
      contentRegex: "",
      negativeTitleRegex: "",
      negativeContentRegex: "",
    });

    if (onStateChange) {
      onStateChange();
    }
  }, [sessionActions, onStateChange]);

  // Reset function for all state
  const reset = useCallback(() => {
    // Reset UI state
    setInternalTitleRegex("");
    setInternalContentRegex("");
    setInternalNegativeTitleRegex("");
    setInternalNegativeContentRegex("");
    setInternalIsRegexActive(true);
    setTitleRegexError(null);
    setContentRegexError(null);
    setNegativeTitleRegexError(null);
    setNegativeContentRegexError(null);
    setIsGeneratingTaskRegex(false);
    setGeneratingRegexJobId(null);
    setRegexGenerationError(null);

    // Update session
    sessionActions.updateCurrentSessionFields({
      titleRegex: "",
      contentRegex: "",
      negativeTitleRegex: "",
      negativeContentRegex: "",
      isRegexActive: true,
    });
  }, [sessionActions]);

  // Clean up debounce timers on unmount
  useEffect(() => {
    // Capture ref objects, not current values
    const titleTimerRef = titleRegexDebounceRef;
    const contentTimerRef = contentRegexDebounceRef;
    const negativeTitleTimerRef = negativeTitleRegexDebounceRef;
    const negativeContentTimerRef = negativeContentRegexDebounceRef;
    
    return () => {
      // Access current values inside the cleanup function
      [
        titleTimerRef.current,
        contentTimerRef.current,
        negativeTitleTimerRef.current,
        negativeContentTimerRef.current,
      ].forEach((timer) => timer && clearTimeout(timer));
    };
  }, []);

  // Monitor background job for regex generation with type safety
  const regexJob = useTypedBackgroundJob(generatingRegexJobId);

  // Process regex job results
  useEffect(() => {
    if (!generatingRegexJobId || !regexJob?.job) {
      return;
    }

    const job = regexJob.job;

    if (job.status === "completed") {
      try {
        // Extract regex patterns from job metadata with type safety
        const metadata = regexJob.metadata || job.metadata;
        // Type guard to ensure regexPatterns is a valid object
        if (metadata && metadata.regexPatterns) {
          const regexPatterns = metadata.regexPatterns;

          // Apply patterns to UI state and session
          applyRegexPatterns({
            titlePattern: typeof regexPatterns.titleRegex === 'string' ? regexPatterns.titleRegex : "",
            contentPattern: typeof regexPatterns.contentRegex === 'string' ? regexPatterns.contentRegex : "",
            negativeTitlePattern: typeof regexPatterns.negativeTitleRegex === 'string' ? regexPatterns.negativeTitleRegex : "",
            negativeContentPattern: typeof regexPatterns.negativeContentRegex === 'string' ? regexPatterns.negativeContentRegex : "",
          });

          // Trigger filter mode change event
          window.dispatchEvent(new CustomEvent("setFilterModeToRegex"));
        } else {
          setIsGeneratingTaskRegex(false);
          setRegexGenerationError("No regex patterns found in response");
        }
      } catch (error) {
        setIsGeneratingTaskRegex(false);
        const errorMessage = error instanceof Error ? error.message : "Error processing regex patterns";
        setRegexGenerationError(errorMessage);
      }
    } else if (job.status === "failed" || job.status === "canceled") {
      setIsGeneratingTaskRegex(false);
      // Type-safe error message handling
      setRegexGenerationError(
        typeof job.errorMessage === 'string' ? job.errorMessage : "Failed to generate regex patterns"
      );
    }
  }, [regexJob, generatingRegexJobId, applyRegexPatterns]);

  // Generate regex from task description
  const handleGenerateRegexFromTask = useCallback(async () => {
    // Validation
    if (!taskDescription.trim()) {
      return;
    }

    if (isGeneratingTaskRegex) {
      return;
    }

    if (!sessionState.activeSessionId) {
      showNotification({
        title: "Cannot Generate Regex",
        message: "Active session required to generate regex patterns.",
        type: "error",
      });
      return;
    }

    // Set loading state
    setIsGeneratingTaskRegex(true);
    setRegexGenerationError(null);

    try {
      // Call the Tauri command directly
      const result = await invoke<{ job_id: string }>(
        "generate_regex_patterns_command",
        {
          sessionId: sessionState.activeSessionId,
          taskDescription: taskDescription,
        }
      );

      // Store job ID to track progress
      setGeneratingRegexJobId(result.job_id);
    } catch (error) {
      console.error("Error generating regex patterns:", error);
      setIsGeneratingTaskRegex(false);
      setRegexGenerationError(
        error instanceof Error ? error.message : "An unknown error occurred"
      );

      showNotification({
        title: "Regex Generation Failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to generate regex patterns",
        type: "error",
      });
    }
  }, [
    taskDescription,
    isGeneratingTaskRegex,
    sessionState.activeSessionId,
    showNotification,
  ]);

  // Return memoized state and actions
  return useMemo(
    () => ({
      // UI state
      titleRegex: internalTitleRegex,
      contentRegex: internalContentRegex,
      negativeTitleRegex: internalNegativeTitleRegex,
      negativeContentRegex: internalNegativeContentRegex,
      isRegexActive: internalIsRegexActive,

      // UI feedback state
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
      reset,
    }),
    [
      // UI state
      internalTitleRegex,
      internalContentRegex,
      internalNegativeTitleRegex,
      internalNegativeContentRegex,
      internalIsRegexActive,

      // UI feedback state
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
      reset,
    ]
  );
}
