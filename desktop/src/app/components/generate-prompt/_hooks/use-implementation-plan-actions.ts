"use client";

import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback, useMemo } from "react";

import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import { useSessionStateContext, useSessionActionsContext } from "@/contexts/session";

/**
 * Hook for managing implementation plan UI interactions
 * Delegates all business logic to Tauri backend
 */
export function useImplementationPlanActions() {
  const { projectDirectory } = useProject();
  const { activeSessionId } = useSessionStateContext();
  const { flushSaves } = useSessionActionsContext();
  const { showNotification, showError } = useNotification();

  // UI state for plan creation
  const [planCreationState, setPlanCreationState] = useState<
    "idle" | "submitting" | "submitted"
  >("idle");
  const isCreatingPlan = planCreationState === "submitting";

  /**
   * Create an implementation plan based on task description and selected files
   * Uses direct Tauri command invocation for backend processing
   * @param selectedRootDirectories - Optional array of root directories to scope the directory tree
   */
  const handleCreateImplementationPlan = useCallback(
    async (
      taskDescription: string, 
      includedPaths: string[],
      selectedRootDirectories?: string[] | null
    ) => {
      // Input validation
      if (!projectDirectory || !taskDescription.trim() || !activeSessionId) {
        showNotification({
          title: "Cannot Create Implementation Plan",
          message:
            "Please ensure you have a project directory and task description.",
          type: "error",
        });
        return;
      }

      if (!includedPaths || includedPaths.length === 0) {
        showNotification({
          title: "Cannot Create Implementation Plan",
          message:
            "Please select at least one file to include in the implementation plan.",
          type: "error",
        });
        return;
      }

      // Set UI to loading state
      setPlanCreationState("submitting");

      try {
        // Ensure session data is persisted before backend operation
        await flushSaves();
        
        // Call the Tauri command directly
        await invoke<{ jobId: string }>(
          "create_implementation_plan_command",
          {
            sessionId: activeSessionId,
            taskDescription,
            projectDirectory: projectDirectory || "",
            relevantFiles: includedPaths,
            selectedRootDirectories: selectedRootDirectories || undefined,
            projectStructure: undefined,
            model: undefined,
            temperature: undefined,
            maxTokens: undefined,
          }
        );

        // Show success state briefly
        setPlanCreationState("submitted");
        setTimeout(() => setPlanCreationState("idle"), 2000);

        // Notify the user
        showNotification({
          title: "Implementation Plan Creation Started",
          message:
            "Your implementation plan is being generated. Check the Implementation Plans panel for results.",
          type: "success",
        });
      } catch (error) {
        console.error("Implementation plan creation failed:", error);

        // Reset UI state
        setPlanCreationState("idle");

        // Use global error handler which will handle billing errors appropriately
        showError(error, "Implementation plan creation", "creating implementation plan");
      }
    },
    [projectDirectory, activeSessionId, showError, showNotification, flushSaves]
  );

  return useMemo(
    () => ({
      // UI state
      isCreatingPlan,
      planCreationState,

      // Actions
      handleCreateImplementationPlan,
    }),
    [isCreatingPlan, planCreationState, handleCreateImplementationPlan]
  );
}
