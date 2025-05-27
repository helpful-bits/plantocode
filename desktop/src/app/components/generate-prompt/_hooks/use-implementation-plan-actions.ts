"use client";

import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback, useMemo } from "react";

import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import { useSessionStateContext } from "@/contexts/session";
import { AppError, ErrorType } from "@/utils/error-handling";
import { handleActionError } from "@/utils/action-utils";

/**
 * Hook for managing implementation plan UI interactions
 * Delegates all business logic to Tauri backend
 */
export function useImplementationPlanActions() {
  const { projectDirectory } = useProject();
  const { activeSessionId } = useSessionStateContext();
  const { showNotification } = useNotification();

  // UI state for plan creation
  const [planCreationState, setPlanCreationState] = useState<
    "idle" | "submitting" | "submitted"
  >("idle");
  const isCreatingPlan = planCreationState === "submitting";

  /**
   * Create an implementation plan based on task description and selected files
   * Uses direct Tauri command invocation for backend processing
   */
  const handleCreateImplementationPlan = useCallback(
    async (taskDescription: string, includedPaths: string[]) => {
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
        // Call the Tauri command directly
        await invoke<{ jobId: string }>(
          "create_implementation_plan_command",
          {
            sessionId: activeSessionId,
            taskDescription,
            projectDirectory: projectDirectory || "",
            relevantFiles: includedPaths,
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

        // Use standardized error handling to get ActionState
        const errorState = handleActionError(error);
        
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

        // Notify the user
        showNotification({
          title: "Implementation Plan Creation Failed",
          message: errorState.message || "An unknown error occurred.",
          type: "error",
        });
      }
    },
    [projectDirectory, activeSessionId, showNotification]
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
