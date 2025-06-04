"use client";

import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback, useEffect } from "react";

import { useBackgroundJob } from "@/contexts/_hooks/use-background-job";
import { useNotification } from "@/contexts/notification-context";
import { useSessionStateContext } from "@/contexts/session";
import { AppError, ErrorType, extractErrorInfo, createUserFriendlyErrorMessage } from "@/utils/error-handling";
import { handleActionError } from "@/utils/action-utils";

export interface UseGuidanceGenerationProps {
  projectDirectory: string | null;
  onGuidanceGenerated: (value: string) => void;
  onInteraction: () => void;
}

export interface UseGuidanceGenerationReturn {
  isGeneratingGuidance: boolean;
  handleGenerateGuidance: (selectedPaths?: string[]) => Promise<void>;
}

/**
 * Hook to manage AI-generated guidance for task description
 * Uses the Tauri backend for all business logic and AI interactions
 */
export function useGuidanceGeneration({
  projectDirectory,
  onGuidanceGenerated,
  onInteraction,
}: UseGuidanceGenerationProps): UseGuidanceGenerationReturn {
  // UI state
  const { showNotification } = useNotification();
  const sessionState = useSessionStateContext();
  const { activeSessionId } = sessionState;
  
  const taskDescription = sessionState.currentSession?.taskDescription || "";
  const [isGeneratingGuidance, setIsGeneratingGuidance] = useState(false);
  const [guidanceJobId, setGuidanceJobId] = useState<string | null>(null);

  // Track the background job with type safety
  const guidanceJobResult = useBackgroundJob(guidanceJobId);

  // Process job completion
  useEffect(() => {
    if (!guidanceJobId || !guidanceJobResult?.job) {
      return;
    }

    // Access job with proper typing
    const job = guidanceJobResult.job;

    // Handle completed job
    if (job.status === "completed" && job.response) {
      // Get guidance text from job response - only if it's a string
      const guidanceText = job.response;

      // Apply it to the task description through callback
      if (typeof guidanceText === "string" && guidanceText.trim()) {
        // Format: add newlines before guidance
        const currentText = taskDescription || "";
        const newText = currentText.trim() + "\n\n" + guidanceText;

        // Call the callback with the new text
        onGuidanceGenerated(newText);

        // Notify user of success
        showNotification({
          title: "Guidance Generated",
          message: "Guidance has been added to your task description.",
          type: "success",
        });

        // Trigger interaction for parent components
        onInteraction();
      }

      // Reset UI state
      setGuidanceJobId(null);
      setIsGeneratingGuidance(false);
    }
    // Handle failed job
    else if (job.status === "failed" || job.status === "canceled") {
      const errorMessage = typeof job.errorMessage === 'string' ? job.errorMessage : "Failed to generate guidance.";
      
      // Extract structured error information for better handling
      const errorInfo = extractErrorInfo(errorMessage);
      const userFriendlyMessage = createUserFriendlyErrorMessage(errorInfo, 'guidance generation');
      
      if (errorInfo.type === ErrorType.BILLING_ERROR) {
        showNotification({
          title: "Upgrade Required",
          message: userFriendlyMessage,
          type: "warning",
          duration: 10000,
          actionButton: {
            label: "View Subscription",
            onClick: () => window.location.pathname = '/settings',
            variant: "default",
            className: "bg-primary text-primary-foreground hover:bg-primary/90"
          }
        });
      } else {
        showNotification({
          title: "Error Generating Guidance",
          message: userFriendlyMessage,
          type: "error",
        });
      }

      // Reset UI state
      setGuidanceJobId(null);
      setIsGeneratingGuidance(false);
    }
  }, [
    guidanceJobResult,
    guidanceJobId,
    onGuidanceGenerated,
    onInteraction,
    showNotification,
    taskDescription,
  ]);

  // Function to initiate guidance generation
  const handleGenerateGuidance = useCallback(
    async (selectedPaths: string[] = []) => {
      // Validation checks
      if (!projectDirectory) {
        showNotification({
          title: "Cannot Generate Guidance",
          message: "Please select a project directory first.",
          type: "warning",
        });
        return;
      }

      if (!taskDescription.trim()) {
        showNotification({
          title: "Cannot Generate Guidance",
          message: "Please provide a task description first.",
          type: "warning",
        });
        return;
      }

      if (isGeneratingGuidance) {
        showNotification({
          title: "Already Generating Guidance",
          message: "Please wait for the current generation to complete.",
          type: "warning",
        });
        return;
      }

      // Set loading state
      setIsGeneratingGuidance(true);

      try {
        // Call the Tauri command directly
        const result = await invoke<string>(
          "generate_guidance_command",
          {
            sessionId: activeSessionId || "",
            projectDirectory: projectDirectory || "",
            taskDescription,
            paths: selectedPaths,
            fileContentsSummary: undefined,
            systemPromptOverride: undefined,
            modelOverride: undefined,
            temperatureOverride: undefined,
            maxTokensOverride: undefined,
          }
        );

        // Store job ID to track progress
        setGuidanceJobId(result);

        showNotification({
          title: "Generating Guidance",
          message:
            "Guidance will be added to your task description when ready.",
          type: "info",
        });
      } catch (error) {
        console.error("Error generating guidance:", error);

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
          setIsGeneratingGuidance(false);
          return;
        }

        // Extract error info and create user-friendly message
        const errorInfo = extractErrorInfo(error);
        const userFriendlyMessage = createUserFriendlyErrorMessage(errorInfo, 'guidance generation');
        
        showNotification({
          title: "Error Generating Guidance",
          message: userFriendlyMessage,
          type: "error",
        });

        // Reset UI state on error
        setIsGeneratingGuidance(false);
      }
    },
    [projectDirectory, taskDescription, isGeneratingGuidance, showNotification]
  );

  return {
    isGeneratingGuidance,
    handleGenerateGuidance,
  };
}
