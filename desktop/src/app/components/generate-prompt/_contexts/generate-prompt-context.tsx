"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";

import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import { useSessionStateContext } from "@/contexts/session";


import { useGeneratePromptCoreState } from "../_hooks/use-generate-prompt-core-state";
import { useGeneratePromptDisplayState } from "../_hooks/use-generate-prompt-display-state";
import { useGeneratePromptPlanState } from "../_hooks/use-generate-prompt-plan-state";
import { useGeneratePromptRegexState } from "../_hooks/use-generate-prompt-regex-state";
import { useGeneratePromptTaskState } from "../_hooks/use-generate-prompt-task-state";
import { type TaskDescriptionHandle } from "../_components/task-description";

import { useFileManagement } from "./file-management-context";


// Define interfaces for each slice of the context value
export type GeneratePromptCoreContextShape = ReturnType<typeof useGeneratePromptCoreState>;

export type GeneratePromptTaskContextShape = ReturnType<typeof useGeneratePromptTaskState>;

export type GeneratePromptRegexContextShape = ReturnType<typeof useGeneratePromptRegexState>;

export type GeneratePromptDisplayContextShape = ReturnType<typeof useGeneratePromptDisplayState>;

export type GeneratePromptPlanContextShape = ReturnType<typeof useGeneratePromptPlanState>;

// Define the main context value interface that combines all shapes
export interface GeneratePromptContextValue {
  core: GeneratePromptCoreContextShape;
  task: GeneratePromptTaskContextShape;
  regex: GeneratePromptRegexContextShape;
  display: GeneratePromptDisplayContextShape;
  plan: GeneratePromptPlanContextShape;
}

// Create the React context
const GeneratePromptContext = createContext<
  GeneratePromptContextValue | undefined
>(undefined);

// Provider component
export function GeneratePromptProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Get shared contexts
  const { projectDirectory } = useProject();

  // Get session state from separate contexts
  const sessionState = useSessionStateContext();

  const { showNotification } = useNotification();
  // Get file management context but we don't use includedPaths in this component
  useFileManagement();

  // Create refs
  const taskDescriptionRef = useRef<TaskDescriptionHandle>(null);

  // Initialize core state first as it's now the central source of truth for session data
  const coreApi = useGeneratePromptCoreState({
    projectDirectory,
    activeSessionId: sessionState.activeSessionId,
    isTransitioningSession: false, // This property may have been removed or renamed
    showNotification,
    isSessionLoading: sessionState.isSessionLoading,
    taskDescriptionRef,
  });

  // Initialize task state - it now reads from SessionContext directly
  const taskApi = useGeneratePromptTaskState({
    handleInteraction: coreApi.handleInteraction,
    taskDescriptionRef,
  });

  // Initialize regex state - it now reads from SessionContext directly
  const regexApi = useGeneratePromptRegexState({
    taskDescription: sessionState.currentSession?.taskDescription || "",
    handleInteraction: coreApi.handleInteraction,
  });

  // Initialize display state with taskDescription from session state
  const displayApi = useGeneratePromptDisplayState({
    taskDescription: sessionState.currentSession?.taskDescription || "",
  });

  // Initialize plan state
  const planApi = useGeneratePromptPlanState();

  // Construct the full context value, memoizing it appropriately
  const contextValue = useMemo(
    () => ({
      core: coreApi,
      task: taskApi,
      regex: regexApi,
      display: displayApi,
      plan: planApi,
    }),
    [coreApi, taskApi, regexApi, displayApi, planApi]
  );

  return (
    <GeneratePromptContext.Provider value={contextValue}>
      {children}
    </GeneratePromptContext.Provider>
  );
}

// Custom consumer hooks for the context and its slices
export function useGeneratePrompt(): GeneratePromptContextValue {
  const context = useContext(GeneratePromptContext);
  if (context === undefined) {
    throw new Error(
      "useGeneratePrompt must be used within a GeneratePromptProvider"
    );
  }
  return context;
}

export function useGeneratePromptCore(): GeneratePromptCoreContextShape {
  return useGeneratePrompt().core;
}

export function useGeneratePromptTask(): GeneratePromptTaskContextShape {
  return useGeneratePrompt().task;
}

export function useGeneratePromptRegex(): GeneratePromptRegexContextShape {
  return useGeneratePrompt().regex;
}

export function useGeneratePromptDisplay(): GeneratePromptDisplayContextShape {
  return useGeneratePrompt().display;
}

export function useGeneratePromptPlan(): GeneratePromptPlanContextShape {
  return useGeneratePrompt().plan;
}
