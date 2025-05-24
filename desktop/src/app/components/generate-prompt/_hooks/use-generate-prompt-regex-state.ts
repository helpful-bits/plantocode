"use client";

import { useCallback, useState, useEffect } from "react";

import { useRegexState } from "./use-regex-state";
import { 
  useSessionStateContext, 
  useSessionActionsContext 
} from "@/contexts/session";
import { useTauriJobCommand } from "@/hooks/use-tauri-command";
import { useProject } from "@/contexts/project-context";
import { useBackgroundJobs } from "@/contexts/background-jobs";

export interface UseGeneratePromptRegexStateProps {
  // Other props
  taskDescription: string;
  handleInteraction?: () => void;
}

export function useGeneratePromptRegexState({
  taskDescription,
  handleInteraction,
}: UseGeneratePromptRegexStateProps) {
  // Get regex values from SessionContext
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();
  
  const titleRegex = sessionState.currentSession?.titleRegex || "";
  const contentRegex = sessionState.currentSession?.contentRegex || "";
  const negativeTitleRegex = sessionState.currentSession?.negativeTitleRegex || "";
  const negativeContentRegex = sessionState.currentSession?.negativeContentRegex || "";
  const isRegexActive = sessionState.currentSession?.isRegexActive ?? true;
  const activeSessionId = sessionState.activeSessionId;
  
  // Get description fields from SessionContext
  const titleRegexDescription = sessionState.currentSession?.titleRegexDescription || "";
  const contentRegexDescription = sessionState.currentSession?.contentRegexDescription || "";
  const negativeTitleRegexDescription = sessionState.currentSession?.negativeTitleRegexDescription || "";
  const negativeContentRegexDescription = sessionState.currentSession?.negativeContentRegexDescription || "";
  const regexSummaryExplanation = sessionState.currentSession?.regexSummaryExplanation || "";
  
  // Get project directory
  const { projectDirectory } = useProject();
  const { getJobById } = useBackgroundJobs();
  
  // State for individual field generation
  const [generatingFieldType, setGeneratingFieldType] = useState<'title' | 'content' | 'negativeTitle' | 'negativeContent' | null>(null);
  const [generatingFieldJobId, setGeneratingFieldJobId] = useState<string | null>(null);
  const [fieldRegexGenerationError, setFieldRegexGenerationError] = useState<string | null>(null);
  
  // Tauri command for individual regex generation
  const { execute: executeRegexGeneration } = useTauriJobCommand({
    command: "generate_regex_command",
    traceName: "generate_regex_for_field",
  });
  
  // Create session updater functions
  const setTitleRegex = useCallback((value: string) => {
    sessionActions.updateCurrentSessionFields({ titleRegex: value });
    if (handleInteraction) handleInteraction();
  }, [sessionActions, handleInteraction]);
  
  const setContentRegex = useCallback((value: string) => {
    sessionActions.updateCurrentSessionFields({ contentRegex: value });
    if (handleInteraction) handleInteraction();
  }, [sessionActions, handleInteraction]);
  
  const setNegativeTitleRegex = useCallback((value: string) => {
    sessionActions.updateCurrentSessionFields({ negativeTitleRegex: value });
    if (handleInteraction) handleInteraction();
  }, [sessionActions, handleInteraction]);
  
  const setNegativeContentRegex = useCallback((value: string) => {
    sessionActions.updateCurrentSessionFields({ negativeContentRegex: value });
    if (handleInteraction) handleInteraction();
  }, [sessionActions, handleInteraction]);
  
  const setIsRegexActive = useCallback((value: boolean) => {
    sessionActions.updateCurrentSessionFields({ isRegexActive: value });
    if (handleInteraction) handleInteraction();
  }, [sessionActions, handleInteraction]);
  
  // Description setters
  const setTitleRegexDescription = useCallback((value: string) => {
    sessionActions.updateCurrentSessionFields({ titleRegexDescription: value });
    if (handleInteraction) handleInteraction();
  }, [sessionActions, handleInteraction]);
  
  const setContentRegexDescription = useCallback((value: string) => {
    sessionActions.updateCurrentSessionFields({ contentRegexDescription: value });
    if (handleInteraction) handleInteraction();
  }, [sessionActions, handleInteraction]);
  
  const setNegativeTitleRegexDescription = useCallback((value: string) => {
    sessionActions.updateCurrentSessionFields({ negativeTitleRegexDescription: value });
    if (handleInteraction) handleInteraction();
  }, [sessionActions, handleInteraction]);
  
  const setNegativeContentRegexDescription = useCallback((value: string) => {
    sessionActions.updateCurrentSessionFields({ negativeContentRegexDescription: value });
    if (handleInteraction) handleInteraction();
  }, [sessionActions, handleInteraction]);
  
  // Implement individual regex generation
  const handleGenerateRegexForField = useCallback(async (
    fieldType: 'title' | 'content' | 'negativeTitle' | 'negativeContent', 
    description: string
  ) => {
    if (!activeSessionId || !projectDirectory) {
      setFieldRegexGenerationError("Session or project directory not available");
      return;
    }

    // Set loading state
    setGeneratingFieldType(fieldType);
    setGeneratingFieldJobId(null);
    setFieldRegexGenerationError(null);

    try {
      // Call the Tauri command with target_field parameter
      const result = await executeRegexGeneration({
        sessionId: activeSessionId,
        projectDirectory: projectDirectory,
        description,
        targetField: fieldType,
      });

      if (result.isSuccess && result.data) {
        // Store the job ID
        setGeneratingFieldJobId(result.data as string);
      } else {
        let extractedErrorMessage = "Failed to start regex generation";
        
        // Try to extract error message from result
        const errorSource = (result as any).error || (result as any).message;
        if (errorSource) {
          if (typeof errorSource === 'string') {
            extractedErrorMessage = errorSource;
          } else if (errorSource instanceof Error) {
            extractedErrorMessage = errorSource.message;
          } else if (typeof errorSource === 'object' && errorSource !== null) {
            // Handle plain objects from Tauri like { ConfigError: "details" }
            if ('message' in errorSource && typeof errorSource.message === 'string') {
              extractedErrorMessage = errorSource.message;
            } else {
              // Extract error from object keys (e.g., ConfigError: "...")
              const errorKeys = Object.keys(errorSource);
              if (errorKeys.length === 1) {
                const errorKey = errorKeys[0];
                const errorValue = (errorSource as any)[errorKey];
                if (typeof errorValue === 'string') {
                  extractedErrorMessage = `${errorKey}: ${errorValue}`;
                } else {
                  extractedErrorMessage = `${errorKey}: ${JSON.stringify(errorValue)}`;
                }
              } else {
                extractedErrorMessage = JSON.stringify(result.error);
              }
            }
          }
        } else if (result.message && typeof result.message === 'string') {
          extractedErrorMessage = result.message;
        }
        
        setFieldRegexGenerationError(extractedErrorMessage);
        setGeneratingFieldType(null);
      }
    } catch (error) {
      let msg = "Unknown error occurred while initiating regex generation.";
      if (error instanceof Error) {
        msg = error.message;
      } else if (typeof error === 'string') {
        msg = error;
      } else if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
        msg = (error as any).message;
      } else {
        try {
          const stringifiedError = JSON.stringify(error);
          msg = stringifiedError === '{}' ? "An unspecified object error occurred." : stringifiedError;
        } catch { /* Fallback to default msg */ }
      }
      setFieldRegexGenerationError(msg);
      setGeneratingFieldType(null);
    }

    if (handleInteraction) handleInteraction();
  }, [activeSessionId, projectDirectory, executeRegexGeneration, handleInteraction]);
  
  // State for summary generation
  const [isGeneratingSummaryExplanation, setIsGeneratingSummaryExplanation] = useState(false);
  const [generatingSummaryJobId, setGeneratingSummaryJobId] = useState<string | null>(null);
  const [summaryGenerationError, setSummaryGenerationError] = useState<string | null>(null);
  
  // Tauri command for summary generation
  const { execute: executeRegexSummaryGeneration } = useTauriJobCommand({
    command: "generate_regex_summary_command",
    traceName: "generate_regex_summary",
  });

  const handleGenerateSummaryExplanation = useCallback(async () => {
    if (!activeSessionId) {
      setSummaryGenerationError("Session not available");
      return;
    }

    // Set loading state
    setIsGeneratingSummaryExplanation(true);
    setGeneratingSummaryJobId(null);
    setSummaryGenerationError(null);

    try {
      // Call the Tauri command
      const result = await executeRegexSummaryGeneration({
        sessionId: activeSessionId,
      });

      if (result.isSuccess && result.data) {
        // Store the job ID
        setGeneratingSummaryJobId(result.data as string);
      } else {
        let extractedErrorMessage = "Failed to start summary generation";
        
        // Try to extract error message from result
        const errorSource = (result as any).error || (result as any).message;
        if (errorSource) {
          if (typeof errorSource === 'string') {
            extractedErrorMessage = errorSource;
          } else if (errorSource instanceof Error) {
            extractedErrorMessage = errorSource.message;
          } else if (typeof errorSource === 'object' && errorSource !== null) {
            // Handle plain objects from Tauri like { ConfigError: "details" }
            if ('message' in errorSource && typeof errorSource.message === 'string') {
              extractedErrorMessage = errorSource.message;
            } else {
              // Extract error from object keys (e.g., ConfigError: "...")
              const errorKeys = Object.keys(errorSource);
              if (errorKeys.length === 1) {
                const errorKey = errorKeys[0];
                const errorValue = (errorSource as any)[errorKey];
                if (typeof errorValue === 'string') {
                  extractedErrorMessage = `${errorKey}: ${errorValue}`;
                } else {
                  extractedErrorMessage = `${errorKey}: ${JSON.stringify(errorValue)}`;
                }
              } else {
                extractedErrorMessage = JSON.stringify(result.error);
              }
            }
          }
        } else if (result.message && typeof result.message === 'string') {
          extractedErrorMessage = result.message;
        }
        
        setSummaryGenerationError(extractedErrorMessage);
        setIsGeneratingSummaryExplanation(false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 
        (typeof error === 'string' ? error : 
          (error && typeof error === 'object' ? JSON.stringify(error) : "Unknown error occurred"));
      setSummaryGenerationError(errorMessage);
      setIsGeneratingSummaryExplanation(false);
    }

    if (handleInteraction) handleInteraction();
  }, [activeSessionId, executeRegexSummaryGeneration, handleInteraction]);

  // Monitor job completion for individual regex generation
  useEffect(() => {
    if (!generatingFieldJobId || !generatingFieldType) return;

    const job = getJobById(generatingFieldJobId);
    if (!job) return;

    // Check if job completed successfully
    if (job.status === "completed" && job.metadata) {
      try {
        // Extract the target field from metadata
        const targetField = job.metadata.targetField || job.metadata.target_field;
        
        // Extract the generated regex pattern
        let regexPattern: string | undefined;
        
        if (job.metadata.regexData && (job.metadata.regexData as any).primary_pattern) {
          regexPattern = (job.metadata.regexData as any).primary_pattern.pattern;
        } else if (job.response) {
          // Fallback: try to extract pattern from response
          try {
            const responseData = JSON.parse(job.response);
            if (responseData.primary_pattern && responseData.primary_pattern.pattern) {
              regexPattern = responseData.primary_pattern.pattern;
            }
          } catch {
            // If JSON parsing fails, treat response as the pattern
            regexPattern = job.response;
          }
        }

        if (regexPattern && targetField === generatingFieldType) {
          // Map target field to session property
          const updateObject: any = {};
          switch (targetField) {
            case 'title':
              updateObject.titleRegex = regexPattern;
              break;
            case 'content':
              updateObject.contentRegex = regexPattern;
              break;
            case 'negativeTitle':
              updateObject.negativeTitleRegex = regexPattern;
              break;
            case 'negativeContent':
              updateObject.negativeContentRegex = regexPattern;
              break;
          }

          // Update session with the generated regex
          sessionActions.updateCurrentSessionFields(updateObject);
        }

        // Reset state
        setGeneratingFieldType(null);
        setGeneratingFieldJobId(null);
        setFieldRegexGenerationError(null);
      } catch (error) {
        let msg = "Failed to process regex generation result.";
        if (error instanceof Error) {
          msg = error.message;
        } else if (typeof error === 'string') {
          msg = error;
        } else if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
          msg = (error as any).message;
        } else {
          try {
            const stringifiedError = JSON.stringify(error);
            msg = stringifiedError === '{}' ? "An unspecified object error occurred processing the result." : stringifiedError;
          } catch { /* Fallback to default msg */ }
        }
        setFieldRegexGenerationError(msg);
        setGeneratingFieldType(null);
        setGeneratingFieldJobId(null);
      }
    } else if (job.status === "failed") {
      // Handle failed job
      setFieldRegexGenerationError(String(job.errorMessage || "The regex generation background job failed."));
      setGeneratingFieldType(null);
      setGeneratingFieldJobId(null);
    }
  }, [generatingFieldJobId, generatingFieldType, getJobById, sessionActions]);

  // Monitor job completion for summary generation
  useEffect(() => {
    if (!generatingSummaryJobId) return;

    const job = getJobById(generatingSummaryJobId);
    if (!job) return;

    // Check if job completed successfully
    if (job.status === "completed" && job.response) {
      try {
        // Update session with the generated summary explanation
        sessionActions.updateCurrentSessionFields({
          regexSummaryExplanation: job.response
        });

        // Reset state
        setIsGeneratingSummaryExplanation(false);
        setGeneratingSummaryJobId(null);
        setSummaryGenerationError(null);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 
          (typeof error === 'string' ? error : 
            (error && typeof error === 'object' ? JSON.stringify(error) : "Failed to process summary generation result"));
        setSummaryGenerationError(errorMessage);
        setIsGeneratingSummaryExplanation(false);
        setGeneratingSummaryJobId(null);
      }
    } else if (job.status === "failed") {
      // Handle failed job
      setSummaryGenerationError(job.errorMessage || "Summary generation failed");
      setIsGeneratingSummaryExplanation(false);
      setGeneratingSummaryJobId(null);
    }
  }, [generatingSummaryJobId, getJobById, sessionActions]);
  // Initialize regex state with UI-specific logic
  const {
    isGeneratingTaskRegex,
    generatingRegexJobId,
    regexGenerationError,
    titleRegexError,
    contentRegexError,
    negativeTitleRegexError,
    negativeContentRegexError,
    handleGenerateRegexFromTask: baseHandleGenerateRegexFromTask,
    applyRegexPatterns: baseApplyRegexPatterns,
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

  // Create an adapter for applyRegexPatterns to match the expected interface
  const applyRegexPatterns = useCallback((patterns: {
    titleRegex?: string;
    contentRegex?: string;
    negativeTitleRegex?: string;
    negativeContentRegex?: string;
    titleRegexDescription?: string;
    contentRegexDescription?: string;
    negativeTitleRegexDescription?: string;
    negativeContentRegexDescription?: string;
  }) => {
    if (handleInteraction) {
      handleInteraction();
    }
    
    // Update session with both patterns and descriptions
    const sessionUpdates: any = {};
    if (patterns.titleRegex !== undefined) sessionUpdates.titleRegex = patterns.titleRegex;
    if (patterns.contentRegex !== undefined) sessionUpdates.contentRegex = patterns.contentRegex;
    if (patterns.negativeTitleRegex !== undefined) sessionUpdates.negativeTitleRegex = patterns.negativeTitleRegex;
    if (patterns.negativeContentRegex !== undefined) sessionUpdates.negativeContentRegex = patterns.negativeContentRegex;
    if (patterns.titleRegexDescription !== undefined) sessionUpdates.titleRegexDescription = patterns.titleRegexDescription;
    if (patterns.contentRegexDescription !== undefined) sessionUpdates.contentRegexDescription = patterns.contentRegexDescription;
    if (patterns.negativeTitleRegexDescription !== undefined) sessionUpdates.negativeTitleRegexDescription = patterns.negativeTitleRegexDescription;
    if (patterns.negativeContentRegexDescription !== undefined) sessionUpdates.negativeContentRegexDescription = patterns.negativeContentRegexDescription;
    
    sessionActions.updateCurrentSessionFields(sessionUpdates);
    
    // Also call the base function for UI state
    baseApplyRegexPatterns({
      titlePattern: patterns.titleRegex,
      contentPattern: patterns.contentRegex,
      negativeTitlePattern: patterns.negativeTitleRegex,
      negativeContentPattern: patterns.negativeContentRegex,
    });
  }, [baseApplyRegexPatterns, handleInteraction, sessionActions]);

  // Create a reset function to clear all regex patterns and descriptions
  const reset = useCallback(() => {
    sessionActions.updateCurrentSessionFields({
      titleRegex: "",
      contentRegex: "",
      negativeTitleRegex: "",
      negativeContentRegex: "",
      titleRegexDescription: "",
      contentRegexDescription: "",
      negativeTitleRegexDescription: "",
      negativeContentRegexDescription: "",
      regexSummaryExplanation: "",
      isRegexActive: true,
    });
    if (handleInteraction) {
      handleInteraction();
    }
  }, [sessionActions, handleInteraction]);

  return {
    // Regex generation UI state
    isGeneratingTaskRegex,
    generatingRegexJobId,
    regexGenerationError,
    
    // Validation errors
    titleRegexError,
    contentRegexError,
    negativeTitleRegexError,
    negativeContentRegexError,
    
    // Current regex values (from SessionContext)
    titleRegex,
    contentRegex,
    negativeTitleRegex,
    negativeContentRegex,
    isRegexActive,
    
    // Description fields (from SessionContext)
    titleRegexDescription,
    contentRegexDescription,
    negativeTitleRegexDescription,
    negativeContentRegexDescription,
    regexSummaryExplanation,
    
    // Individual field generation state
    generatingFieldType,
    generatingFieldJobId,
    fieldRegexGenerationError,
    
    // Summary generation state
    isGeneratingSummaryExplanation,
    generatingSummaryJobId,
    summaryGenerationError,
    
    // Regex setters (update SessionContext)
    setTitleRegex,
    setContentRegex,
    setNegativeTitleRegex,
    setNegativeContentRegex,
    setIsRegexActive,
    
    // Description setters
    setTitleRegexDescription,
    setContentRegexDescription,
    setNegativeTitleRegexDescription,
    setNegativeContentRegexDescription,
    
    // Regex actions
    handleGenerateRegexFromTask,
    handleGenerateRegexForField,
    handleGenerateSummaryExplanation,
    applyRegexPatterns,
    handleClearPatterns,
    reset,
  };
}
