"use client";

import { useCallback, useState, useEffect, useMemo } from "react";

import { useRegexState } from "./use-regex-state";
import { getErrorMessage } from "@/utils/error-handling";
import { 
  useSessionStateContext, 
  useSessionActionsContext 
} from "@/contexts/session";
import { useTauriJobCommand } from "@/hooks/use-tauri-command";
import { useProject } from "@/contexts/project-context";
import { useBackgroundJobs } from "@/contexts/background-jobs";
import { getParsedMetadata } from "../../background-jobs-sidebar/utils";

export interface UseGeneratePromptRegexStateProps {
  handleInteraction?: () => void;
}

interface RegexJobResponse {
  jobId: string;
}

export function useGeneratePromptRegexState({
  handleInteraction,
}: UseGeneratePromptRegexStateProps) {
  // Get regex values from SessionContext
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();
  
  const taskDescription = sessionState.currentSession?.taskDescription || "";
  
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
  const [generatingFieldType, setGeneratingFieldType] = useState<'title' | 'content' | 'negativeTitle' | 'negativeContent' | undefined>(undefined);
  const [generatingFieldJobId, setGeneratingFieldJobId] = useState<string | undefined>(undefined);
  const [fieldRegexGenerationError, setFieldRegexGenerationError] = useState<string | undefined>(undefined);
  
  // Tauri command for individual regex generation
  const { execute: executeRegexGeneration } = useTauriJobCommand<RegexJobResponse>({
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
    setGeneratingFieldJobId(undefined);
    setFieldRegexGenerationError(undefined);

    try {
      // Call the Tauri command with targetField parameter
      const result = await executeRegexGeneration({
        sessionId: activeSessionId,
        projectDirectory: projectDirectory,
        description,
        targetField: fieldType,
      });

      if (result.isSuccess && result.data?.jobId && typeof result.data.jobId === 'string') {
        setGeneratingFieldJobId(result.data.jobId);
      } else if (result.isSuccess) { // Success but jobId is problematic
        const errorMsg = "Job started but a valid job ID was not returned from the backend.";
        setFieldRegexGenerationError(errorMsg);
        console.error("[RegexState] Unexpected data structure on success (jobId missing/invalid):", JSON.stringify(result.data));
        setGeneratingFieldType(undefined);
      } else { // Not isSuccess
        const errorMessage = getErrorMessage(result.error) || result.message || "Failed to start regex generation for field.";
        setFieldRegexGenerationError(errorMessage);
        console.error("[RegexState] Regex generation failed:", JSON.stringify(result));
        setGeneratingFieldType(undefined);
      }
    } catch (error) {
      let msg = "Unknown error occurred.";
      if (error instanceof Error) {
        msg = error.message;
      } else if (typeof error === 'string') {
        msg = error;
      } else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        msg = error.message;
      } else {
        try {
          const stringifiedError = JSON.stringify(error);
          msg = stringifiedError === '{}' ? "An unspecified object error occurred." : stringifiedError;
        } catch { /* Fallback to default msg */ }
      }
      setFieldRegexGenerationError(msg);
      setGeneratingFieldType(undefined);
    }

    if (handleInteraction) handleInteraction();
  }, [activeSessionId, projectDirectory, executeRegexGeneration, handleInteraction]);
  
  // State for summary generation
  const [isGeneratingSummaryExplanation, setIsGeneratingSummaryExplanation] = useState(false);
  const [generatingSummaryJobId, setGeneratingSummaryJobId] = useState<string | undefined>(undefined);
  const [summaryGenerationError, setSummaryGenerationError] = useState<string | undefined>(undefined);
  
  // Tauri command for summary generation
  const { execute: executeRegexSummaryGeneration } = useTauriJobCommand<RegexJobResponse>({
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
    setGeneratingSummaryJobId(undefined);
    setSummaryGenerationError(undefined);

    try {
      // Call the Tauri command
      const result = await executeRegexSummaryGeneration({
        sessionId: activeSessionId,
      });

      if (result.isSuccess && result.data?.jobId && typeof result.data.jobId === 'string') {
        setGeneratingSummaryJobId(result.data.jobId);
      } else if (result.isSuccess) { // Success but jobId is problematic
        const errorMsg = "Job started but a valid job ID was not returned from the backend.";
        setSummaryGenerationError(errorMsg);
        console.error("[RegexState] Unexpected data structure on success (jobId missing/invalid):", JSON.stringify(result.data));
        setIsGeneratingSummaryExplanation(false);
      } else { // Not isSuccess
        const errorMessage = getErrorMessage(result.error) || result.message || "Failed to start regex summary generation.";
        setSummaryGenerationError(errorMessage);
        console.error("[RegexState] Regex summary generation failed:", JSON.stringify(result));
        setIsGeneratingSummaryExplanation(false);
      }
    } catch (error) {
      let msg = "Unknown error occurred.";
      if (error instanceof Error) {
        msg = error.message;
      } else if (typeof error === 'string') {
        msg = error;
      } else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        msg = error.message;
      } else {
        try {
          const stringifiedError = JSON.stringify(error);
          msg = stringifiedError === '{}' ? "An unspecified object error occurred." : stringifiedError;
        } catch { /* Fallback to default msg */ }
      }
      setSummaryGenerationError(msg);
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
        // Use safe metadata parsing
        const metadata = getParsedMetadata(job.metadata);
        
        // Extract the target field from metadata with safe access
        const targetField = metadata?.targetField || metadata?.target_field;
        
        // Extract the generated regex pattern with safe property access
        let regexPattern: string | undefined;
        
        // Define a type guard for regex data structure
        const isRegexDataObj = (obj: unknown): obj is { 
          primary_pattern?: { pattern?: string }; 
          primaryPattern?: { pattern?: string };
        } => {
          return obj !== null && typeof obj === 'object';
        };
        
        const regexDataObj = metadata?.regexData;
        if (isRegexDataObj(regexDataObj)) {
          if (regexDataObj.primary_pattern?.pattern) { // Check snake_case
            regexPattern = regexDataObj.primary_pattern.pattern;
          } else if (regexDataObj.primaryPattern?.pattern) { // Fallback to camelCase
            regexPattern = regexDataObj.primaryPattern.pattern;
          }
        }
        
        if (!regexPattern && job.response) {
          // Fallback: try to extract pattern from response
          try {
            const responseData = JSON.parse(job.response);
            // Check both snake_case and camelCase for robustness
            const patternFromResponse = responseData?.primary_pattern?.pattern || responseData?.primaryPattern?.pattern;
            if (patternFromResponse && typeof patternFromResponse === 'string') {
              regexPattern = patternFromResponse;
            }
          } catch {
            // If JSON parsing fails, treat response as the pattern
            regexPattern = job.response;
          }
        }

        if (regexPattern && targetField === generatingFieldType) {
          // Map target field to session property
          type SessionRegexUpdate = {
            titleRegex?: string;
            contentRegex?: string;
            negativeTitleRegex?: string;
            negativeContentRegex?: string;
          };
          
          const updateObject: SessionRegexUpdate = {};
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
        setGeneratingFieldType(undefined);
        setGeneratingFieldJobId(undefined);
        setFieldRegexGenerationError(undefined);
      } catch (error) {
        let msg = "Failed to process regex generation result.";
        if (error instanceof Error) {
          msg = error.message;
        } else if (typeof error === 'string') {
          msg = error;
        } else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
          msg = error.message;
        } else {
          try {
            const stringifiedError = JSON.stringify(error);
            msg = stringifiedError === '{}' ? "An unspecified object error occurred processing the result." : stringifiedError;
          } catch { /* Fallback to default msg */ }
        }
        setFieldRegexGenerationError(msg);
        setGeneratingFieldType(undefined);
        setGeneratingFieldJobId(undefined);
      }
    } else if (job.status === "failed") {
      // Handle failed job
      setFieldRegexGenerationError(job.errorMessage || "The regex generation background job failed.");
      setGeneratingFieldType(undefined);
      setGeneratingFieldJobId(undefined);
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
        setGeneratingSummaryJobId(undefined);
        setSummaryGenerationError(undefined);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 
          (typeof error === 'string' ? error : 
            (error && typeof error === 'object' ? JSON.stringify(error) : "Failed to process summary generation result"));
        setSummaryGenerationError(errorMessage);
        setIsGeneratingSummaryExplanation(false);
        setGeneratingSummaryJobId(undefined);
      }
    } else if (job.status === "failed") {
      // Handle failed job
      setSummaryGenerationError(job.errorMessage || "Summary generation failed");
      setIsGeneratingSummaryExplanation(false);
      setGeneratingSummaryJobId(undefined);
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
    onStateChange: handleInteraction,
    taskDescription,
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

  return useMemo(
    () => ({
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
    }),
    [
      isGeneratingTaskRegex,
      generatingRegexJobId,
      regexGenerationError,
      titleRegexError,
      contentRegexError,
      negativeTitleRegexError,
      negativeContentRegexError,
      titleRegex,
      contentRegex,
      negativeTitleRegex,
      negativeContentRegex,
      isRegexActive,
      titleRegexDescription,
      contentRegexDescription,
      negativeTitleRegexDescription,
      negativeContentRegexDescription,
      regexSummaryExplanation,
      generatingFieldType,
      generatingFieldJobId,
      fieldRegexGenerationError,
      isGeneratingSummaryExplanation,
      generatingSummaryJobId,
      summaryGenerationError,
      setTitleRegex,
      setContentRegex,
      setNegativeTitleRegex,
      setNegativeContentRegex,
      setIsRegexActive,
      setTitleRegexDescription,
      setContentRegexDescription,
      setNegativeTitleRegexDescription,
      setNegativeContentRegexDescription,
      handleGenerateRegexFromTask,
      handleGenerateRegexForField,
      handleGenerateSummaryExplanation,
      applyRegexPatterns,
      handleClearPatterns,
      reset,
    ]
  );
}
