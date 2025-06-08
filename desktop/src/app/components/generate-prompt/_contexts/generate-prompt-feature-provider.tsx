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
import { useGeneratePromptTaskState } from "../_hooks/use-generate-prompt-task-state";
import { useGeneratePromptPlanState } from "../_hooks/use-generate-prompt-plan-state";
import { generateDirectoryTreeAction } from "@/actions/file-system/directory-tree.actions";

// Import the granular context providers
import { type CorePromptContextValue } from "./_types/generate-prompt-core-types";
import { type DisplayContextValue } from "./_types/generated-prompt-display-types";
import { type PlanContextValue } from "./_types/implementation-plan-types";
import { type TaskContextValue } from "./_types/task-description-types";
import { CorePromptContextProvider } from "./core-prompt-context";
import { DisplayContextProvider } from "./display-context";
import { PlanContextProvider } from "./plan-context";
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

  const formState = useGenerateFormState({
    activeSessionId: sessionState.currentSession?.id || null,
    isTransitioningSession: sessionState.isSessionLoading,
    projectDirectory: projectDirectory || null,
  });

  // Handle user interactions that modify session
  const handleInteraction = useCallback(() => {
    sessionActions.setSessionModified(true);
  }, [sessionActions.setSessionModified]);


  // Use self-contained hooks that access session context directly
  const taskState = useGeneratePromptTaskState({ taskDescriptionRef });
  const displayState = useGeneratePromptDisplayState();
  const planState = useGeneratePromptPlanState();

  // Complete state reset function
  const resetAllState = useCallback(() => {
    formState.resetFormState();
    sessionActions.setSessionModified(false);
    taskState.resetTaskState();
    // Reset session fields
    sessionActions.updateCurrentSessionFields({
      taskDescription: "",
      titleRegex: "",
      contentRegex: "",
      negativeTitleRegex: "",
      negativeContentRegex: "",
      isRegexActive: true,
      searchTerm: "",
      includedFiles: [],
      forceExcludedFiles: [],
      searchSelectedFilesOnly: false,
    });
  }, [
    formState.resetFormState, 
    sessionActions.setSessionModified, 
    sessionActions.updateCurrentSessionFields,
    taskState.resetTaskState
  ]);

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

    try {
      const result = await generateDirectoryTreeAction(projectDirectory);
      if (result.isSuccess && result.data?.directoryTree) {
        // Update the session with the generated directory tree
        if (sessionState.activeSessionId) {
          // Directory tree generated but not stored in session
        }
        showNotification({
          title: "Success",
          message: "Directory tree generated successfully",
          type: "success"
        });
      } else {
        showNotification({
          title: "Error",
          message: result.message || "Failed to generate directory tree",
          type: "error"
        });
      }
    } catch (error) {
      showNotification({
        title: "Error",
        message: "Failed to generate directory tree",
        type: "error"
      });
    }
  }, [
    projectDirectory, 
    showNotification, 
    sessionState.activeSessionId, 
    sessionActions.updateCurrentSessionFields
  ]);

  // Memoize inline functions to prevent re-creation
  const setSessionName = useCallback(
    (name: string) => sessionActions.updateCurrentSessionFields({ name }),
    [sessionActions.updateCurrentSessionFields]
  );

  const saveSessionState = useCallback(
    async () => { await sessionActions.saveCurrentSession(); },
    [sessionActions.saveCurrentSession]
  );

  const flushPendingSaves = useCallback(
    async () => { await sessionActions.flushSaves(); return true; },
    [sessionActions.flushSaves]
  );

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
        sessionName: sessionState.currentSession?.name || "Untitled Session",
        hasUnsavedChanges: sessionState.isSessionModified,
        isFormSaving: sessionState.isSessionLoading || formState.isFormSaving,
        isSessionFormLoading: sessionState.isSessionLoading,
        error: formState.error,

        // Project data
        projectDirectory: projectDirectory || null,
        projectDataLoading: formState.projectDataLoading,
      },
      actions: {
        // Core actions (complex orchestrations only)
        resetAllState,
        setSessionName,
        saveSessionState,
        flushPendingSaves,
        setHasUnsavedChanges: sessionActions.setSessionModified,
        setSessionInitialized: formState.setSessionInitialized,
        handleInteraction,
        handleGenerateCodebase,
      },
    }),
    [
      // Session state primitives
      sessionState.currentSession?.id,
      sessionState.currentSession?.name,
      sessionState.isSessionLoading,
      sessionState.isSessionModified,
      
      // Form state primitives and stable functions
      formState.isStateLoaded,
      formState.isRestoringSession,
      formState.sessionInitialized,
      formState.isFormSaving,
      formState.error,
      formState.projectDataLoading,
      formState.setSessionInitialized,
      
      // Project directory primitive
      projectDirectory,
      
      // Stable memoized callbacks
      resetAllState,
      setSessionName,
      saveSessionState,
      flushPendingSaves,
      sessionActions.setSessionModified,
      handleInteraction,
      handleGenerateCodebase,
    ]
  );

  // Add flush pending task changes action
  const flushPendingTaskChanges = useCallback(() => {
    if (taskDescriptionRef.current?.flushPendingChanges) {
      return taskDescriptionRef.current.flushPendingChanges();
    }
    return null;
  }, []);

  const taskContextValue = useMemo<TaskContextValue>(
    () => ({
      state: {
        // Task UI state
        taskDescriptionRef: taskState.taskDescriptionRef,
        isGeneratingGuidance: taskState.isGeneratingGuidance,
        isImprovingText: taskState.isImprovingText,
        textImprovementJobId: taskState.textImprovementJobId,
      },
      actions: {
        // Task description actions
        handleGenerateGuidance: taskState.handleGenerateGuidance,
        handleImproveSelection: taskState.handleImproveSelection,
        flushPendingTaskChanges,
        reset: taskState.resetTaskState,
      },
    }),
    [
      // The taskState object is already memoized from the hook
      taskState,
      flushPendingTaskChanges,
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
      // The displayState object is already memoized from the hook
      displayState,
    ]
  );

  const planContextValue = useMemo<PlanContextValue>(
    () => ({
      state: {
        // Implementation plan state
        isCreatingPlan: planState.isCreatingPlan,
        planCreationState: planState.planCreationState,
        isCopyingPlanPrompt: planState.isCopyingPlanPrompt,
        isEstimatingTokens: planState.isEstimatingTokens,
        estimatedTokens: planState.estimatedTokens,
      },
      actions: {
        // Implementation plan actions
        handleCreateImplementationPlan: planState.handleCreateImplementationPlan,
        handleCopyImplementationPlanPrompt: planState.handleCopyImplementationPlanPrompt,
        handleGetImplementationPlanPrompt: planState.handleGetImplementationPlanPrompt,
        handleEstimatePlanTokens: planState.handleEstimatePlanTokens,
      },
    }),
    [
      // The planState object is already memoized from the hook
      planState,
    ]
  );

  // Provide all context values using the new granular providers
  return (
    <CorePromptContextProvider value={coreContextValue}>
      <TaskContextProvider value={taskContextValue}>
        <DisplayContextProvider value={displayContextValue}>
          <PlanContextProvider value={planContextValue}>
            {children}
          </PlanContextProvider>
        </DisplayContextProvider>
      </TaskContextProvider>
    </CorePromptContextProvider>
  );
};

GeneratePromptFeatureProvider.displayName = "GeneratePromptFeatureProvider";
