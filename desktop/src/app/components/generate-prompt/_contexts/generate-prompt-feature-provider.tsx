"use client";

import { useMemo, useRef, useCallback, useState, useEffect, type ReactNode } from "react";

import { TooltipProvider } from "@/ui/tooltip";
import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import { useRuntimeConfig } from "@/contexts/runtime-config-context";
import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session";

import { type TaskDescriptionHandle } from "../_components/task-description";
import { useGenerateFormState } from "../_hooks/use-generate-form-state";
import { useGeneratePromptTaskState } from "../_hooks/use-generate-prompt-task-state";
import { useGeneratePromptPlanState } from "../_hooks/use-generate-prompt-plan-state";
import { generateDirectoryTreeAction } from "@/actions/file-system/directory-tree.actions";
import { estimatePromptTokensAction } from "@/actions/ai/prompt.actions";
import { type PromptTokenEstimateResponse as TokenEstimate } from "@/types/tauri-commands";

// Import the granular context providers
import { type CorePromptContextValue } from "./_types/generate-prompt-core-types";
import { type PlanContextValue } from "./_types/implementation-plan-types";
import { type TaskContextValue } from "./_types/task-description-types";
import { CorePromptContextProvider } from "./core-prompt-context";
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
  const { config: runtimeConfig } = useRuntimeConfig();

  // Create DOM ref for TaskDescriptionHandle
  const taskDescriptionRef = useRef<TaskDescriptionHandle>(null);

  // Token estimation state
  const [tokenEstimate, setTokenEstimate] = useState<TokenEstimate | null>(null);

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
  const planState = useGeneratePromptPlanState();

  // Complete state reset function
  const resetAllState = useCallback(() => {
    formState.resetFormState();
    sessionActions.setSessionModified(false);
    taskState.resetTaskState();
    // Reset session fields
    sessionActions.updateCurrentSessionFields({
      taskDescription: "",
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

  // Token estimation effect (debounced)
  useEffect(() => {
    const taskDescription = sessionState.currentSession?.taskDescription;
    const includedFiles = sessionState.currentSession?.includedFiles;
    const sessionId = sessionState.currentSession?.id;

    if (!taskDescription || !taskDescription.trim() || !sessionId) {
      setTokenEstimate(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const result = await estimatePromptTokensAction({
          sessionId,
          taskDescription,
          projectDirectory: projectDirectory || "",
          relevantFiles: includedFiles && includedFiles.length > 0 ? includedFiles : [],
          taskType: "task_refinement",
          model: runtimeConfig?.tasks?.task_refinement?.model || runtimeConfig?.tasks?.taskRefinement?.model || ""
        });

        if (result.isSuccess && result.data) {
          setTokenEstimate(result.data);
        } else {
          setTokenEstimate(null);
        }
      } catch (error) {
        console.error("Failed to estimate tokens:", error);
        setTokenEstimate(null);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [
    sessionState.currentSession?.taskDescription,
    sessionState.currentSession?.includedFiles,
    sessionState.currentSession?.id,
    projectDirectory,
  ]);

  // Create memoized context values
  const coreContextValue = useMemo<CorePromptContextValue>(
    () => ({
      state: {
        // Session state
        activeSessionId: sessionState.currentSession?.id || null,
        isStateLoaded: formState.isStateLoaded,
        isSwitchingSession: sessionState.isSessionLoading,
        lifecycleStatus: formState.lifecycleStatus,
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
      formState.lifecycleStatus,
      formState.isFormSaving,
      formState.error,
      formState.projectDataLoading,
      
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
        isRefiningTask: taskState.isRefiningTask,
        isDoingWebSearch: taskState.isDoingWebSearch,
        tokenEstimate: tokenEstimate,
        canUndo: taskState.canUndo,
        canRedo: taskState.canRedo,
        webSearchResults: taskState.webSearchResults,
      },
      actions: {
        // Task description actions
        handleRefineTask: taskState.handleRefineTask,
        handleWebSearch: taskState.handleWebSearch,
        cancelWebSearch: taskState.cancelWebSearch,
        flushPendingTaskChanges,
        reset: taskState.resetTaskState,
        undo: taskState.undo,
        redo: taskState.redo,
        applyWebSearchResults: taskState.applyWebSearchResults,
      },
    }),
    [
      // The taskState object is already memoized from the hook
      taskState,
      tokenEstimate,
      flushPendingTaskChanges,
    ]
  );



  const planContextValue = useMemo<PlanContextValue>(
    () => ({
      state: {
        // Implementation plan state
        isCreatingPlan: planState.isCreatingPlan,
        planCreationState: planState.planCreationState,
      },
      actions: {
        // Implementation plan actions
        handleCreateImplementationPlan: planState.handleCreateImplementationPlan,
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
        <PlanContextProvider value={planContextValue}>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </PlanContextProvider>
      </TaskContextProvider>
    </CorePromptContextProvider>
  );
};

GeneratePromptFeatureProvider.displayName = "GeneratePromptFeatureProvider";
