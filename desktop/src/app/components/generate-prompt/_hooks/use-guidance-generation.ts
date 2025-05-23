"use client";

import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback, useEffect } from "react";

import { useTypedBackgroundJob } from "@/contexts/_hooks/use-typed-background-job";
import { useNotification } from "@/contexts/notification-context";
import { useSessionStateContext } from "@/contexts/session";

export interface UseGuidanceGenerationProps {
  projectDirectory: string | null;
  taskDescription: string;
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
  taskDescription,
  onGuidanceGenerated,
  onInteraction,
}: UseGuidanceGenerationProps): UseGuidanceGenerationReturn {
  // UI state
  const { showNotification } = useNotification();
  const { activeSessionId } = useSessionStateContext();
  const [isGeneratingGuidance, setIsGeneratingGuidance] = useState(false);
  const [guidanceJobId, setGuidanceJobId] = useState<string | null>(null);

  // Track the background job with type safety
  const guidanceJobResult = useTypedBackgroundJob(guidanceJobId);

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
      showNotification({
        title: "Error Generating Guidance",
        message: typeof job.errorMessage === 'string' ? job.errorMessage : "Failed to generate guidance.",
        type: "error",
      });

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

        showNotification({
          title: "Error Generating Guidance",
          message:
            error instanceof Error
              ? error.message
              : "An unknown error occurred.",
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
