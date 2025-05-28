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
// Removed backward compatibility hook
import { useGuidanceGeneration } from "../_hooks/use-guidance-generation";
import { useImplementationPlanActions } from "../_hooks/use-implementation-plan-actions";
import { useSessionMetadata } from "../_hooks/use-session-metadata";
import { useTaskDescriptionState } from "../_hooks/use-task-description-state";
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
import { FileManagementProvider } from "./file-management-provider";

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
  }, [sessionActions]);

  // Handle guidance generation callback
  const handleGuidanceGenerated = useCallback((newText: string) => {
    sessionActions.updateCurrentSessionFields({ taskDescription: newText });
  }, [sessionActions]);

  // Note: Removed simple pass-through actions (setSessionName, saveSessionState, setHasUnsavedChanges)
  // Components should use useSessionActionsContext directly for these

  const sessionMetadata = useSessionMetadata({
    onInteraction: handleInteraction,
    initialSessionName: sessionState.currentSession?.name || "Untitled Session",
  });

  const taskState = useTaskDescriptionState({
    activeSessionId: sessionState.activeSessionId,
    taskDescriptionRef,
    onInteraction: handleInteraction,
  });


  const guidanceGeneration = useGuidanceGeneration({
    projectDirectory: projectDirectory || "",
    onGuidanceGenerated: handleGuidanceGenerated,
    onInteraction: handleInteraction,
  });

  // Use the simplified display state hook
  const displayState = useGeneratePromptDisplayState();

  const implementationPlanActions = useImplementationPlanActions();

  // Complete state reset function
  const resetAllState = useCallback(() => {
    sessionMetadata.reset();
    formState.resetFormState();
    sessionActions.setSessionModified(false);
    taskState.reset();
  }, [sessionMetadata.reset, formState.resetFormState, sessionActions.setSessionModified, taskState.reset]);

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
          sessionActions.updateCurrentSessionFields({
            codebaseStructure: result.data.directoryTree,
          });
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
  }, [projectDirectory, showNotification, sessionState.activeSessionId, sessionActions]);

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
        isSessionFormLoading: sessionState.isSessionLoading,
        error: formState.error,

        // Project data
        projectDirectory: projectDirectory || null,
        projectDataLoading: formState.projectDataLoading,
      },
      actions: {
        // Core actions (complex orchestrations only)
        resetAllState,
        setSessionName: (name: string) => sessionActions.renameActiveSession(name),
        saveSessionState: async () => { await sessionActions.saveCurrentSession(); },
        flushPendingSaves: async () => { await sessionActions.flushSaves(); return true; },
        setHasUnsavedChanges: sessionActions.setSessionModified,
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
          createdAt: sessionState.currentSession?.createdAt || Date.now(),
        }),
        setSessionInitialized: formState.setSessionInitialized,
        handleInteraction,
        handleGenerateCodebase,
      },
    }),
    [
      sessionState.currentSession?.id,
      sessionState.currentSession?.name,
      sessionState.currentSession?.taskDescription,
      sessionState.currentSession?.titleRegex,
      sessionState.currentSession?.contentRegex,
      sessionState.currentSession?.negativeTitleRegex,
      sessionState.currentSession?.negativeContentRegex,
      sessionState.currentSession?.isRegexActive,
      sessionState.currentSession?.searchTerm,
      sessionState.currentSession?.includedFiles,
      sessionState.currentSession?.forceExcludedFiles,
      sessionState.currentSession?.searchSelectedFilesOnly,
      sessionState.currentSession?.codebaseStructure,
      sessionState.currentSession?.modelUsed,
      sessionState.currentSession?.createdAt,
      sessionState.isSessionLoading,
      sessionState.isSessionModified,
      sessionActions,
      formState.isStateLoaded,
      formState.isRestoringSession,
      formState.sessionInitialized,
      formState.isFormSaving,
      formState.error,
      formState.projectDataLoading,
      formState.setSessionInitialized,
      projectDirectory,
      sessionMetadata.sessionName,
      handleInteraction,
      resetAllState,
      handleGenerateCodebase,
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
        <DisplayContextProvider value={displayContextValue}>
          <PlanContextProvider value={planContextValue}>
            <FileManagementProvider>
              {children}
            </FileManagementProvider>
          </PlanContextProvider>
        </DisplayContextProvider>
      </TaskContextProvider>
    </CorePromptContextProvider>
  );
};

GeneratePromptFeatureProvider.displayName = "GeneratePromptFeatureProvider";
