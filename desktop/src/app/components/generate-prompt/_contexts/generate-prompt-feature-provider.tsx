"use client";

import { useMemo, useRef, useCallback, type ReactNode } from "react";

import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session";

import { type TaskDescriptionHandle } from "../_components/task-description";
import { useGenerateFormState } from "../_hooks/use-generate-form-state";
import { useGeneratePromptDisplayState } from "../_hooks/use-generate-prompt-display-state";
import { useGeneratePromptUI } from "../_hooks/use-generate-prompt-ui";
// Removed backward compatibility hook
import { useGuidanceGeneration } from "../_hooks/use-guidance-generation";
import { useImplementationPlanActions } from "../_hooks/use-implementation-plan-actions";
import { useGeneratePromptRegexState } from "../_hooks/use-generate-prompt-regex-state";
import { useSessionMetadata } from "../_hooks/use-session-metadata";
import { useTaskDescriptionState } from "../_hooks/use-task-description-state";
import { generateDirectoryTree } from "@/utils/directory-tree";

// Import the granular context providers
import { type CorePromptContextValue } from "./_types/generate-prompt-core-types";
import { type DisplayContextValue } from "./_types/generated-prompt-display-types";
import { type PlanContextValue } from "./_types/implementation-plan-types";
import { type RegexContextValue } from "./_types/regex-types";
import { type TaskContextValue } from "./_types/task-description-types";
import { CorePromptContextProvider } from "./core-prompt-context";
import { DisplayContextProvider } from "./display-context";
import { PlanContextProvider } from "./plan-context";
import { RegexContextProvider } from "./regex-context";
import { TaskContextProvider } from "./task-context";

// Import context types


// Provider component
export function GeneratePromptFeatureProvider({ 
  children 
}: { 
  children: ReactNode 
}) {
  // Access global contexts
  const { projectDirectory } = useProject();
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();
  const { showNotification } = useNotification();

  // Create DOM ref for TaskDescriptionHandle
  const taskDescriptionRef = useRef<TaskDescriptionHandle>(null);

  // State management hooks
  useGeneratePromptUI();

  const formState = useGenerateFormState({
    activeSessionId: sessionState.currentSession?.id || null,
    isTransitioningSession: sessionState.isSessionLoading,
    projectDirectory: projectDirectory || null,
  });

  // Handle user interactions that modify session
  const handleInteraction = useCallback(() => {
    if (
      sessionState.currentSession?.id &&
      !sessionState.isSessionLoading &&
      formState.sessionInitialized
    ) {
      sessionActions.setSessionModified(true);
    }
  }, [sessionState.currentSession?.id, sessionState.isSessionLoading, formState.sessionInitialized, sessionActions]);

  const sessionMetadata = useSessionMetadata({
    onInteraction: handleInteraction,
    initialSessionName: sessionState.currentSession?.name || "Untitled Session",
  });

  const taskState = useTaskDescriptionState({
    taskDescription: sessionState.currentSession?.taskDescription || "",
    activeSessionId: sessionState.currentSession?.id || null,
    taskDescriptionRef,
    onInteraction: handleInteraction,
  });

  const regexState = useGeneratePromptRegexState({
    taskDescription: sessionState.currentSession?.taskDescription || "",
    handleInteraction,
  });

  const guidanceGeneration = useGuidanceGeneration({
    taskDescription: sessionState.currentSession?.taskDescription || "",
    projectDirectory: projectDirectory || "",
    onGuidanceGenerated: (newText: string) => 
      sessionActions.updateCurrentSessionFields({ taskDescription: newText }),
    onInteraction: handleInteraction,
  });

  // Use the simplified display state hook
  const displayState = useGeneratePromptDisplayState({
    taskDescription: sessionState.currentSession?.taskDescription || "",
  });

  const implementationPlanActions = useImplementationPlanActions();

  // Complete state reset function
  const resetAllState = useCallback(() => {
    sessionMetadata.reset();
    formState.resetFormState();
    sessionActions.setSessionModified(false);
    taskState.reset();
    regexState.reset();
  }, [sessionMetadata, formState, sessionActions, taskState, regexState]);

  // Handler for generating codebase directory tree
  const handleGenerateCodebase = useCallback(async () => {
    if (!projectDirectory) {
      showNotification({
        title: "Generate Codebase",
        message: "Select a project directory first",
        type: "error",
      });
      return;
    }

    const jobId = await generateDirectoryTree(projectDirectory);
    if (!jobId) {
      showNotification({
        title: "Generate Codebase",
        message: "Failed to start directory tree generation",
        type: "error",
      });
    } else {
      showNotification({
        title: "Generate Codebase",
        message: "Directory tree generation started",
        type: "success",
      });
    }
  }, [projectDirectory, showNotification]);

  // Create memoized context values
  const coreContextValue = useMemo<CorePromptContextValue>(
    () => ({
      state: {
        // Session state
        activeSessionId: sessionState.currentSession?.id || null,
        isStateLoaded: formState.isStateLoaded,
        isSwitchingSession: sessionState.isSessionLoading,
        isRestoringSession: formState.isRestoringSession,
        sessionInitialized: formState.sessionInitialized,
        sessionName:
          sessionState.currentSession?.name || sessionMetadata.sessionName,
        hasUnsavedChanges: sessionState.isSessionModified,
        isFormSaving: sessionState.isSessionLoading || formState.isFormSaving,
        error: formState.error,

        // Project data
        projectDirectory: projectDirectory || null,
        projectDataLoading: formState.projectDataLoading,
      },
      actions: {
        // Core actions
        resetAllState,
        setSessionName: (name: string) =>
          sessionActions.updateCurrentSessionFields({ name }),
        saveSessionState: async (_sessionId: string, _stateToSave?: Record<string, unknown>) => {
          // The _stateToSave and _sessionId params are from the original type, but saveCurrentSession doesn't use them.
          // We just call saveCurrentSession and adapt the return type to void.
          await sessionActions.saveCurrentSession();
        },
        flushPendingSaves: () => sessionActions.flushSaves(),
        getCurrentSessionState: () => ({
          projectDirectory: projectDirectory || "",
          taskDescription: sessionState.currentSession?.taskDescription || "",
          titleRegex: sessionState.currentSession?.titleRegex || "",
          contentRegex: sessionState.currentSession?.contentRegex || "",
          negativeTitleRegex: sessionState.currentSession?.negativeTitleRegex || "",
          negativeContentRegex: sessionState.currentSession?.negativeContentRegex || "",
          isRegexActive: sessionState.currentSession?.isRegexActive || false,
          // Include file management state from current session if available
          searchTerm: sessionState.currentSession?.searchTerm || "",
          includedFiles: sessionState.currentSession?.includedFiles || [],
          forceExcludedFiles: sessionState.currentSession?.forceExcludedFiles || [],
          searchSelectedFilesOnly: sessionState.currentSession?.searchSelectedFilesOnly || false,
          // Include codebase structure from current session if available
          codebaseStructure: sessionState.currentSession?.codebaseStructure || "",
          // Include model used from current session if available, or use a default
          modelUsed: sessionState.currentSession?.modelUsed || undefined,
        }),
        setSessionInitialized: formState.setSessionInitialized,
        setHasUnsavedChanges: (value: boolean) =>
          sessionActions.setSessionModified(value),
        handleInteraction: handleInteraction,
        handleGenerateCodebase,
      },
    }),
    [
      sessionState.currentSession?.id,
      sessionState.currentSession?.name,
      sessionState.currentSession?.searchTerm,
      sessionState.currentSession?.includedFiles,
      sessionState.currentSession?.forceExcludedFiles,
      sessionState.currentSession?.searchSelectedFilesOnly,
      sessionState.currentSession?.codebaseStructure,
      sessionState.currentSession?.modelUsed,
      sessionState.isSessionLoading,
      sessionState.isSessionModified,
      sessionActions,
      formState.isStateLoaded,
      formState.isRestoringSession,
      formState.sessionInitialized,
      formState.isFormSaving,
      formState.error,
      formState.projectDataLoading,
      projectDirectory,
      sessionMetadata.sessionName,
      handleInteraction,
      resetAllState,
      handleGenerateCodebase,
      formState.setSessionInitialized,
    ]
  );

  const taskContextValue = useMemo<TaskContextValue>(
    () => ({
      state: {
        // Task UI state only
        taskDescriptionRef,
        isGeneratingGuidance: guidanceGeneration.isGeneratingGuidance,
        isImprovingText: taskState.isImprovingText,
        textImprovementJobId: taskState.textImprovementJobId,
      },
      actions: {
        // Task description actions
        handleGenerateGuidance: guidanceGeneration.handleGenerateGuidance,
        handleImproveSelection: taskState.handleImproveSelection,
        reset: taskState.reset,
      },
    }),
    [
      taskState.isImprovingText,
      taskState.textImprovementJobId,
      taskState.handleImproveSelection,
      taskState.reset,
      guidanceGeneration.isGeneratingGuidance,
      guidanceGeneration.handleGenerateGuidance,
      taskDescriptionRef
    ]
  );

  const regexContextValue = useMemo<RegexContextValue>(
    () => ({
      state: {
        // Regex UI state only (validation errors, generation status)
        titleRegexError: null,
        contentRegexError: null,
        negativeTitleRegexError: null,
        negativeContentRegexError: null,
        isGeneratingTaskRegex: regexState.isGeneratingTaskRegex,
        generatingRegexJobId: regexState.generatingRegexJobId,
        regexGenerationError: regexState.regexGenerationError,
        
        // Individual field generation state
        generatingFieldType: regexState.generatingFieldType,
        generatingFieldJobId: regexState.generatingFieldJobId,
        fieldRegexGenerationError: regexState.fieldRegexGenerationError,
        
        // Description fields
        titleRegexDescription: regexState.titleRegexDescription,
        contentRegexDescription: regexState.contentRegexDescription,
        negativeTitleRegexDescription: regexState.negativeTitleRegexDescription,
        negativeContentRegexDescription: regexState.negativeContentRegexDescription,
        regexSummaryExplanation: regexState.regexSummaryExplanation,
        
        // Summary generation state
        isGeneratingSummaryExplanation: regexState.isGeneratingSummaryExplanation,
        generatingSummaryJobId: regexState.generatingSummaryJobId,
        summaryGenerationError: regexState.summaryGenerationError,
      },
      actions: {
        // Regex actions - these should use sessionActions for actual updates
        setTitleRegex: regexState.setTitleRegex,
        setContentRegex: regexState.setContentRegex,
        setNegativeTitleRegex: regexState.setNegativeTitleRegex,
        setNegativeContentRegex: regexState.setNegativeContentRegex,
        setIsRegexActive: regexState.setIsRegexActive,
        
        // Description setters
        setTitleRegexDescription: regexState.setTitleRegexDescription,
        setContentRegexDescription: regexState.setContentRegexDescription,
        setNegativeTitleRegexDescription: regexState.setNegativeTitleRegexDescription,
        setNegativeContentRegexDescription: regexState.setNegativeContentRegexDescription,
        
        // Generation functions
        handleGenerateRegexForField: regexState.handleGenerateRegexForField,
        handleGenerateSummaryExplanation: regexState.handleGenerateSummaryExplanation,
        handleGenerateRegexFromTask: regexState.handleGenerateRegexFromTask,
        applyRegexPatterns: (patterns) => {
          regexState.applyRegexPatterns(patterns);
        },
        handleClearPatterns: regexState.handleClearPatterns,
        reset: regexState.reset,
      },
    }),
    [
      regexState.isGeneratingTaskRegex,
      regexState.generatingRegexJobId,
      regexState.regexGenerationError,
      regexState.setTitleRegex,
      regexState.setContentRegex,
      regexState.setNegativeTitleRegex,
      regexState.setNegativeContentRegex,
      regexState.setIsRegexActive,
      regexState.handleGenerateRegexFromTask,
      regexState.applyRegexPatterns,
      regexState.handleClearPatterns,
      regexState.reset
    ]
  );

  const displayContextValue = useMemo<DisplayContextValue>(
    () => ({
      state: {
        // Generated prompt state
        prompt: displayState.prompt,
        tokenCount: displayState.tokenCount,
        copySuccess: displayState.copySuccess,
        showPrompt: displayState.showPrompt,
      },
      actions: {
        // Generated prompt display actions
        setShowPrompt: displayState.setShowPrompt,
        copyPrompt: displayState.copyPrompt,
      },
    }),
    [
      displayState.prompt,
      displayState.tokenCount,
      displayState.copySuccess,
      displayState.showPrompt,
      displayState.setShowPrompt,
      displayState.copyPrompt
    ]
  );

  const planContextValue = useMemo<PlanContextValue>(
    () => ({
      state: {
        // Implementation plan state
        isCreatingPlan: implementationPlanActions.isCreatingPlan,
        planCreationState: implementationPlanActions.planCreationState,
        isCopyingPlanPrompt: false, // Removed as we don't need to display the prompt anymore
        isEstimatingTokens: false, // Removed as token estimation is now done in the backend
        estimatedTokens: 0, // Removed as token estimation is now done in the backend
      },
      actions: {
        // Implementation plan actions
        handleCreateImplementationPlan:
          implementationPlanActions.handleCreateImplementationPlan,
        handleCopyImplementationPlanPrompt: () => {
          // Backend now handles this functionality
        },
        handleGetImplementationPlanPrompt: () => {
          // Backend now handles this functionality
          return "";
        },
        handleEstimatePlanTokens: async () => {
          // Backend now handles token estimation
          return Promise.resolve(0);
        },
      },
    }),
    [
      implementationPlanActions.isCreatingPlan,
      implementationPlanActions.planCreationState,
      implementationPlanActions.handleCreateImplementationPlan
    ]
  );

  // Provide all context values using the new granular providers
  return (
    <CorePromptContextProvider value={coreContextValue}>
      <TaskContextProvider value={taskContextValue}>
        <RegexContextProvider value={regexContextValue}>
          <DisplayContextProvider value={displayContextValue}>
            <PlanContextProvider value={planContextValue}>
              {children}
            </PlanContextProvider>
          </DisplayContextProvider>
        </RegexContextProvider>
      </TaskContextProvider>
    </CorePromptContextProvider>
  );
};
