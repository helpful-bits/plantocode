"use client";

import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";

import { useTypedBackgroundJob } from "@/contexts/_hooks/use-typed-background-job";
import { useNotification } from "@/contexts/notification-context";
import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session";
import { useProject } from "@/contexts/project-context";
import { AppError, ErrorType } from "@/utils/error-handling";
import { handleActionError } from "@/utils/action-utils";
import { getParsedMetadata } from "../../background-jobs-sidebar/utils";

import type { Session } from "@/types/session-types";

interface UseRegexStateProps {
  onStateChange?: () => void;
  taskDescription: string;
}

export function useRegexState({
  onStateChange,
  taskDescription,
}: UseRegexStateProps) {
  // Get session and notification contexts
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();
  const { showNotification } = useNotification();
  const { projectDirectory } = useProject();

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

  // Get current regex values directly from session context
  const titleRegex = sessionState.currentSession?.titleRegex || "";
  const contentRegex = sessionState.currentSession?.contentRegex || "";
  const negativeTitleRegex = sessionState.currentSession?.negativeTitleRegex || "";
  const negativeContentRegex = sessionState.currentSession?.negativeContentRegex || "";
  const isRegexActive = sessionState.currentSession?.isRegexActive ?? true;

  // Debounce timer for all regex field updates
  const regexUpdateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // No need to sync internal state since we read directly from session context

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
      errorSetter: React.Dispatch<React.SetStateAction<string | null>>,
      fieldName: Extract<
        keyof Session,
        | "titleRegex"
        | "contentRegex"
        | "negativeTitleRegex"
        | "negativeContentRegex"
      >
    ) => {
      // Validate regex pattern
      const error = validateRegex(value);
      errorSetter(error);

      // Debounce the session update
      if (regexUpdateDebounceRef.current) {
        clearTimeout(regexUpdateDebounceRef.current);
      }

      regexUpdateDebounceRef.current = setTimeout(() => {
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
        setTitleRegexError,
        "titleRegex"
      );
    },
    [handleRegexFieldChange]
  );

  const handleContentRegexChange = useCallback(
    (value: string) => {
      handleRegexFieldChange(
        value,
        setContentRegexError,
        "contentRegex"
      );
    },
    [handleRegexFieldChange]
  );

  const handleNegativeTitleRegexChange = useCallback(
    (value: string) => {
      handleRegexFieldChange(
        value,
        setNegativeTitleRegexError,
        "negativeTitleRegex"
      );
    },
    [handleRegexFieldChange]
  );

  const handleNegativeContentRegexChange = useCallback(
    (value: string) => {
      handleRegexFieldChange(
        value,
        setNegativeContentRegexError,
        "negativeContentRegex"
      );
    },
    [handleRegexFieldChange]
  );

  // Toggle regex active state
  const handleToggleRegexActive = useCallback(
    (newValue?: boolean) => {
      const nextValue =
        typeof newValue === "boolean" ? newValue : !isRegexActive;

      // Skip if the value is already set
      if (nextValue === isRegexActive) {
        return;
      }

      // Update session
      sessionActions.updateCurrentSessionFields({
        isRegexActive: nextValue,
      });

      if (onStateChange) {
        onStateChange();
      }
    },
    [isRegexActive, sessionActions, onStateChange]
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
      // Update validation errors
      const updateFields: Partial<Session> = {};

      if (titlePattern !== undefined) {
        setTitleRegexError(validateRegex(titlePattern));
        updateFields.titleRegex = titlePattern;
      }

      if (contentPattern !== undefined) {
        setContentRegexError(validateRegex(contentPattern));
        updateFields.contentRegex = contentPattern;
      }

      if (negativeTitlePattern !== undefined) {
        setNegativeTitleRegexError(validateRegex(negativeTitlePattern));
        updateFields.negativeTitleRegex = negativeTitlePattern;
      }

      if (negativeContentPattern !== undefined) {
        setNegativeContentRegexError(validateRegex(negativeContentPattern));
        updateFields.negativeContentRegex = negativeContentPattern;
      }

      // Only update session if we have patterns
      if (Object.keys(updateFields).length > 0) {
        // Enable regex mode if we have patterns
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
    // Clear validation errors
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
    // Reset validation errors
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

  // Clean up debounce timer on unmount
  useEffect(() => {
    const timerRef = regexUpdateDebounceRef;
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Monitor background job for regex generation with type safety
  const regexJob = useTypedBackgroundJob(generatingRegexJobId);

  // Process regex job results
  useEffect(() => {
    const jobData = regexJob?.job; // regexJob is the result of useTypedBackgroundJob
    if (!generatingRegexJobId || !jobData) {
      return;
    }

    if (jobData.status === "completed") {
      try {
        const parsedJobMetadata = getParsedMetadata(jobData.metadata);

        if (parsedJobMetadata?.regexData && typeof parsedJobMetadata.regexData === 'object') {
          const regexData = parsedJobMetadata.regexData as any; // Assuming structure after parsing

          // Access snake_case primary_pattern from the regexData object
          const primaryPattern = regexData.primary_pattern?.pattern;

          if (primaryPattern && typeof primaryPattern === 'string') {
            applyRegexPatterns({
              titlePattern: primaryPattern,
              contentPattern: "",
              negativeTitlePattern: "",
              negativeContentPattern: "",
            });
            window.dispatchEvent(new CustomEvent("setFilterModeToRegex"));
          } else {
            setIsGeneratingTaskRegex(false);
            setRegexGenerationError("No valid primary pattern found in response metadata's regexData.");
          }
        } else if (jobData.response) { // Fallback to raw response
          try {
            const responseData = JSON.parse(jobData.response);
            const primaryPattern = responseData?.primary_pattern?.pattern;
            if (primaryPattern && typeof primaryPattern === 'string') {
              applyRegexPatterns({ titlePattern: primaryPattern, contentPattern: "", negativeTitlePattern: "", negativeContentPattern: "" });
              window.dispatchEvent(new CustomEvent("setFilterModeToRegex"));
            } else {
              setRegexGenerationError("No regex pattern found in job response.");
            }
          } catch (e) {
            applyRegexPatterns({ titlePattern: jobData.response, contentPattern: "", negativeTitlePattern: "", negativeContentPattern: "" }); // Treat as simple string if not JSON
            window.dispatchEvent(new CustomEvent("setFilterModeToRegex"));
          }
        } else {
          setIsGeneratingTaskRegex(false);
          setRegexGenerationError("No regex data or response found in completed job.");
        }
      } catch (error) {
        setIsGeneratingTaskRegex(false);
        const errorMessage = error instanceof Error ? error.message : "Error processing regex patterns";
        setRegexGenerationError(errorMessage);
      }
    } else if (jobData.status === "failed" || jobData.status === "canceled") {
      setIsGeneratingTaskRegex(false);
      // Type-safe error message handling
      const errorMessage = typeof jobData.errorMessage === 'string' ? jobData.errorMessage : "Failed to generate regex patterns";
      setRegexGenerationError(errorMessage);

      // Check for billing errors in job failure
      const errorMessageLower = errorMessage.toLowerCase();
      const isBillingError = errorMessage && 
        (errorMessageLower.includes("not available on your current plan") || 
         errorMessageLower.includes("payment required") || 
         errorMessageLower.includes("billing error") || 
         errorMessageLower.includes("upgrade required") ||
         errorMessageLower.includes("subscription plan"));

      if (isBillingError) {
        showNotification({
          title: "Upgrade Required",
          message: errorMessage || "This feature or model requires a higher subscription plan.",
          type: "warning",
          duration: 10000,
          actionButton: {
            label: "View Subscription",
            onClick: () => window.location.pathname = '/settings',
            variant: "default",
            className: "bg-primary text-primary-foreground hover:bg-primary/90"
          }
        });
      }
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
      const result = await invoke<{ jobId: string }>(
        "generate_regex_command",
        {
          sessionId: sessionState.activeSessionId,
          projectDirectory: projectDirectory || "",
          description: taskDescription,
        }
      );

      // Store job ID to track progress
      setGeneratingRegexJobId(result.jobId);
    } catch (error) {
      console.error("Error generating regex patterns:", error);
      setIsGeneratingTaskRegex(false);
      
      // Use standardized error handling to get ActionState
      const errorState = handleActionError(error);
      setRegexGenerationError(errorState.message || "An unknown error occurred");

      // Check for billing errors
      if (errorState.error instanceof AppError && errorState.error.type === ErrorType.BILLING_ERROR) {
        showNotification({
          title: "Upgrade Required",
          message: errorState.error.message || "This feature or model requires a higher subscription plan.",
          type: "warning",
          duration: 10000,
          actionButton: {
            label: "View Subscription",
            onClick: () => window.location.pathname = '/settings',
            variant: "default",
            className: "bg-primary text-primary-foreground hover:bg-primary/90"
          }
        });
        return;
      }

      showNotification({
        title: "Regex Generation Failed",
        message: errorState.message || "Failed to generate regex patterns",
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
      // UI state from SessionContext
      titleRegex,
      contentRegex,
      negativeTitleRegex,
      negativeContentRegex,
      isRegexActive,

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
      // UI state from SessionContext
      titleRegex,
      contentRegex,
      negativeTitleRegex,
      negativeContentRegex,
      isRegexActive,

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
