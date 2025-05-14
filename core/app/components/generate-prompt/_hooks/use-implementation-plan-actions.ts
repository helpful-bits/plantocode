"use client";

import { useState, useCallback } from "react";
import { useSessionContext } from '@core/lib/contexts/session-context';
import { useProject } from '@core/lib/contexts/project-context';
import { useNotification } from '@core/lib/contexts/notification-context';
import {
  createImplementationPlanAction,
  getImplementationPlanPromptAction
} from '@core/actions/implementation-plan-actions';
import { generateImplementationPlanSystemPrompt } from '@core/lib/prompts/implementation-plan-prompts';
import { estimateTokens } from '@core/lib/token-estimator';

/**
 * Hook for managing implementation plan related actions
 */
export function useImplementationPlanActions() {
  const { projectDirectory } = useProject();
  const { activeSessionId } = useSessionContext();
  const { showNotification } = useNotification();

  // Implementation plan state
  const [planCreationState, setPlanCreationState] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const isCreatingPlan = planCreationState === 'submitting';
  const [isCopyingPlanPrompt, setIsCopyingPlanPrompt] = useState(false);
  const [isEstimatingTokens, setIsEstimatingTokens] = useState(false);
  const [estimatedTokens, setEstimatedTokens] = useState<number | null>(null);

  /**
   * Get implementation plan prompt string
   * Returns the combined system and user prompt or null on error
   */
  const handleGetImplementationPlanPrompt = useCallback(async (
    taskDescription: string,
    includedPaths: string[]
  ): Promise<string | null> => {
    try {
      if (!projectDirectory || !taskDescription.trim() || includedPaths.length === 0) {
        showNotification({
          title: "Cannot Generate Plan Prompt",
          message: "Please ensure you have a project directory, task description, and at least one file selected.",
          type: "error"
        });
        return null;
      }

      const result = await getImplementationPlanPromptAction({
        projectDirectory,
        taskDescription,
        relevantFiles: includedPaths
      });

      if (result.isSuccess && result.data?.prompt) {
        // Get the static system prompt
        const systemPrompt = generateImplementationPlanSystemPrompt();

        // Combine system and user prompts
        return `${systemPrompt}\n\n${result.data.prompt}`;
      } else {
        showNotification({
          title: "Prompt Generation Failed",
          message: result.message || "An error occurred while generating the implementation plan prompt.",
          type: "error"
        });
        return null;
      }
    } catch (error) {
      console.error("[handleGetImplementationPlanPrompt]", error);
      showNotification({
        title: "Prompt Generation Failed",
        message: error instanceof Error ? error.message : "An unknown error occurred.",
        type: "error"
      });
      return null;
    }
  }, [projectDirectory, showNotification]);

  /**
   * Estimates token usage for implementation plan generation
   */
  const handleEstimatePlanTokens = useCallback(async (
    taskDescription: string,
    includedPaths: string[]
  ): Promise<void> => {
    // Set loading state to indicate estimation is in progress
    setIsEstimatingTokens(true);
    
    try {
      if (!projectDirectory || !taskDescription.trim() || includedPaths.length === 0) {
        // No notification to avoid distractions
        setIsEstimatingTokens(false);
        return;
      }

      // Get the full prompt for token estimation
      const fullPrompt = await handleGetImplementationPlanPrompt(taskDescription, includedPaths);
      
      // If prompt generation failed, handleGetImplementationPlanPrompt will show a notification
      if (fullPrompt === null) {
        setIsEstimatingTokens(false);
        return;
      }
      
      // Estimate token usage
      const estimated = await estimateTokens(fullPrompt);
      setEstimatedTokens(estimated);
    } catch (error) {
      console.error("[handleEstimatePlanTokens] Error:", error);
      // Don't show error notifications to avoid distraction
    } finally {
      setIsEstimatingTokens(false);
    }
  }, [projectDirectory, handleGetImplementationPlanPrompt]);

  /**
   * Create an implementation plan based on the task description and selected files
   */
  const handleCreateImplementationPlan = useCallback(async (
    taskDescription: string,
    includedPaths: string[]
  ) => {
    const timestamp = new Date().toISOString();
    console.log(`[handleCreateImplementationPlan][${timestamp}] Starting implementation plan creation`);
    
    try {
      if (!projectDirectory || !taskDescription.trim() || !activeSessionId) {
        showNotification({
          title: "Cannot Create Implementation Plan",
          message: "Please ensure you have a project directory and task description.",
          type: "error"
        });
        return;
      }

      // Enhanced validation for file selection
      if (!includedPaths || includedPaths.length === 0) {
        console.warn("[handleCreateImplementationPlan] No files selected, cannot generate implementation plan");
        showNotification({
          title: "Cannot Create Implementation Plan",
          message: "Please select at least one file to include in the implementation plan.",
          type: "error"
        });
        return;
      }

      // Estimate tokens if not already done, but don't wait for result
      if (estimatedTokens === null) {
        // Fire and forget - we don't need to await this since we won't show a confirmation
        handleEstimatePlanTokens(taskDescription, includedPaths);
      }

      // Show submitting state during the API call
      setPlanCreationState('submitting');
      
      console.log(`[handleCreateImplementationPlan][${timestamp}] Calling API with:`, {
        projectDir: projectDirectory,
        taskDescLength: taskDescription.length,
        sessionId: activeSessionId,
        includedPathsCount: includedPaths.length,
        estimatedTokens
      });

      const result = await createImplementationPlanAction({
        projectDirectory,
        taskDescription,
        relevantFiles: includedPaths,
        sessionId: activeSessionId,
        temperatureOverride: undefined
      });

      // Show brief success state
      setPlanCreationState('submitted');
      
      // Reset state after a brief moment (to show success feedback)
      setTimeout(() => {
        setPlanCreationState('idle');
      }, 2000);

      if (result.isSuccess) {
        console.log(`[handleCreateImplementationPlan][${timestamp}] Success response:`, {
          isBackgroundJob: !!result.metadata?.isBackgroundJob,
          jobId: result.metadata?.jobId
        });

        // Check if this is a background job
        if (result.metadata?.isBackgroundJob) {
          showNotification({
            title: "Implementation Plan Creation Started",
            message: "Your implementation plan is being generated in the background. Check the Background Jobs panel for progress and the Implementation Plans panel for results.",
            type: "success"
          });
        } else {
          showNotification({
            title: "Implementation Plan Creation Started",
            message: "Your implementation plan is being generated. Check the Implementation Plans panel for results.",
            type: "success"
          });
        }
      } else {
        console.error(`[handleCreateImplementationPlan][${timestamp}] Error response:`, result.message);
        showNotification({
          title: "Implementation Plan Creation Failed",
          message: result.message || "An error occurred while creating the implementation plan.",
          type: "error"
        });
      }
    } catch (error) {
      console.error(`[handleCreateImplementationPlan] Exception:`, error);
      showNotification({
        title: "Implementation Plan Creation Failed",
        message: error instanceof Error ? error.message : "An unknown error occurred.",
        type: "error"
      });
      // Make sure to reset state on error
      setPlanCreationState('idle');
    }
  }, [projectDirectory, activeSessionId, estimatedTokens, showNotification, handleEstimatePlanTokens]);

  /**
   * Copy implementation plan prompt to clipboard
   * Combines both the system prompt and user prompt
   */
  const handleCopyImplementationPlanPrompt = useCallback(async (
    taskDescription: string,
    includedPaths: string[]
  ): Promise<void> => {
    setIsCopyingPlanPrompt(true);

    try {
      if (!projectDirectory || !taskDescription.trim() || includedPaths.length === 0) {
        showNotification({
          title: "Cannot Copy Plan Prompt",
          message: "Please ensure you have a project directory, task description, and at least one file selected.",
          type: "error"
        });
        return;
      }

      const result = await getImplementationPlanPromptAction({
        projectDirectory,
        taskDescription,
        relevantFiles: includedPaths
      });

      if (result.isSuccess && result.data?.prompt) {
        // Get the static system prompt
        const systemPrompt = generateImplementationPlanSystemPrompt();

        // Combine system and user prompts
        const fullPrompt = `${systemPrompt}\n\n${result.data.prompt}`;

        // Copy the combined prompt to clipboard
        await navigator.clipboard.writeText(fullPrompt);

        // Display success notification
        showNotification({
          title: "Prompt Copied",
          message: "System + User Prompt copied to clipboard.",
          type: "success"
        });
      } else {
        showNotification({
          title: "Copy Failed",
          message: result.message || "An error occurred while copying the implementation plan prompt.",
          type: "error"
        });
      }
    } catch (error) {
      console.error("[handleCopyImplementationPlanPrompt]", error);
      showNotification({
        title: "Copy Failed",
        message: error instanceof Error ? error.message : "An unknown error occurred.",
        type: "error"
      });
    } finally {
      setIsCopyingPlanPrompt(false);
    }
  }, [projectDirectory, showNotification]);

  return {
    // State
    isCreatingPlan,
    planCreationState,
    isCopyingPlanPrompt,
    isEstimatingTokens,
    estimatedTokens,

    // Actions
    handleCreateImplementationPlan,
    handleCopyImplementationPlanPrompt,
    handleGetImplementationPlanPrompt,
    handleEstimatePlanTokens
  };
}