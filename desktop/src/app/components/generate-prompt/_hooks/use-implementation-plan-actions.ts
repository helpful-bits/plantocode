"use client";

import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback, useMemo } from "react";

import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import { useSessionStateContext, useSessionActionsContext } from "@/contexts/session";
import { getSessionAction } from "@/actions/session/crud.actions";

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

  const handleCreateImplementationPlan = useCallback(
    async (
      selectedRootDirectories?: string[] | null,
      enableWebSearch?: boolean,
      includeProjectStructure?: boolean
    ) => {
      if (!activeSessionId) {
        showNotification({
          title: "Cannot Create Implementation Plan",
          message: "No active session found.",
          type: "error",
        });
        return;
      }

      // Ensure session data is persisted before validation and backend operation
      await flushSaves();

      const freshResult = await getSessionAction(activeSessionId);
      const fresh = freshResult?.isSuccess && freshResult.data ? freshResult.data : null;

      if (!fresh?.taskDescription?.trim()) {
        showNotification({
          title: "Cannot Create Implementation Plan",
          message: "Please provide a task description.",
          type: "error",
        });
        return;
      }

      if (!fresh.includedFiles || fresh.includedFiles.length === 0) {
        showNotification({
          title: "Cannot Create Implementation Plan",
          message: "Please select at least one file to include in the implementation plan.",
          type: "error",
        });
        return;
      }

      // Set UI to loading state
      setPlanCreationState("submitting");

      try {
        
        // Call the Tauri command directly
        // Note: enableWebSearch parameter is not yet supported by the backend command
        // and will need to be added when backend support is implemented
        await invoke<{ jobId: string }>(
          "create_implementation_plan_command",
          {
            sessionId: activeSessionId,
            taskDescription: fresh.taskDescription,
            projectDirectory: fresh.projectDirectory,
            relevantFiles: fresh.includedFiles,
            selectedRootDirectories: selectedRootDirectories || undefined,
            projectStructure: undefined,
            model: undefined,
            temperature: undefined,
            maxTokens: undefined,
            enableWebSearch: enableWebSearch || false,
            includeProjectStructure: includeProjectStructure !== false,
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
