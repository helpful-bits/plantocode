"use client";

import { FileCode } from "lucide-react";
import { useCallback } from "react";

import { useNotification } from "@/contexts/notification-context";
import { useSessionStateContext } from "@/contexts/session";
import { Button } from "@/ui/button";

import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";
import { usePlanContext } from "../_contexts/plan-context";

export interface ImplementationPlanActionsProps {
  variant?: "default" | "compact";
  className?: string;
  disabled?: boolean;
}

/**
 * UI component for implementation plan generation
 * Pure presentation layer that delegates all business logic to Tauri backend
 */
export const ImplementationPlanActions = ({ 
  variant = "default", 
  className = "", 
  disabled = false 
}: ImplementationPlanActionsProps) => {
  // Use contexts to get state and actions
  const { state: coreState } = useCorePromptContext();
  const { state: planState, actions: planActions } = usePlanContext();
  const { currentSession } = useSessionStateContext();
  const fileState = useFileManagement();
  const { showNotification } = useNotification();

  // Extract required values
  const { projectDirectory, activeSessionId } = coreState;
  const taskDescription = currentSession?.taskDescription || "";
  const { isCreatingPlan, planCreationState } = planState;
  const { handleCreateImplementationPlan } = planActions;

  // Validation for enable/disable state
  const canPerformPlanAction = Boolean(
    projectDirectory &&
      taskDescription.trim() &&
      fileState.includedPaths.length > 0 &&
      activeSessionId &&
      !disabled
  );

  // Handle plan creation with error feedback
  const createPlan = useCallback(async () => {
    try {
      await handleCreateImplementationPlan(
        taskDescription,
        fileState.includedPaths
      );
    } catch (error) {
      showNotification({
        title: "Implementation Plan Creation Failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to create implementation plan",
        type: "error",
      });
    }
  }, [
    handleCreateImplementationPlan,
    taskDescription,
    fileState.includedPaths,
    showNotification,
  ]);

  // Button text based on state
  const buttonText = isCreatingPlan
    ? "Creating..."
    : planCreationState === "submitted"
      ? "Started!"
      : "Create Implementation Plan";

  // Render compact variant
  if (variant === "compact") {
    return (
      <div className={`space-y-2 ${className}`}>
        <Button
          variant="default"
          size="sm"
          onClick={createPlan}
          disabled={!canPerformPlanAction || isCreatingPlan}
          className="w-full"
        >
          <FileCode className="h-3.5 w-3.5 mr-1.5" />
          {buttonText}
        </Button>
      </div>
    );
  }

  // Render default variant
  return (
    <div className={`bg-card p-6 rounded-lg border shadow-sm ${className}`}>
      <div>
        <h3 className="text-sm font-medium mb-3">Implementation Plans</h3>

        <Button
          variant="default"
          size="sm"
          onClick={createPlan}
          disabled={!canPerformPlanAction || isCreatingPlan}
          className="flex items-center justify-center w-full h-9"
        >
          <FileCode className="h-4 w-4 mr-2" />
          {buttonText}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-3 text-balance">
        Creates an implementation plan based on your task description and
        selected files.
      </p>
    </div>
  );
};

export default ImplementationPlanActions;
