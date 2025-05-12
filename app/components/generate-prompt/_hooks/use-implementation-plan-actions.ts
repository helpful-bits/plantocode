"use client";

import { useState, useCallback } from "react";
import { useSessionContext } from "@/lib/contexts/session-context";
import { useProject } from "@/lib/contexts/project-context";
import { useNotification } from '@/lib/contexts/notification-context';
import { 
  createImplementationPlanAction, 
  getImplementationPlanPromptAction 
} from '@/actions/implementation-plan-actions';

/**
 * Hook for managing implementation plan related actions
 */
export function useImplementationPlanActions() {
  const { projectDirectory } = useProject();
  const { activeSessionId } = useSessionContext();
  const { showNotification } = useNotification();

  // Implementation plan state
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [planPromptCopySuccess, setPlanPromptCopySuccess] = useState(false);
  const [isCopyingPlanPrompt, setIsCopyingPlanPrompt] = useState(false);

  /**
   * Create an implementation plan based on the task description and selected files
   */
  const handleCreateImplementationPlan = useCallback(async (
    taskDescription: string,
    includedPaths: string[], 
    fileContentsMap: Record<string, string>
  ) => {
    const timestamp = new Date().toISOString();
    console.log(`[handleCreateImplementationPlan][${timestamp}] Starting implementation plan creation`);
    setIsCreatingPlan(true);

    try {
      if (!projectDirectory || !taskDescription.trim() || !activeSessionId) {
        showNotification({
          title: "Cannot Create Implementation Plan",
          message: "Please ensure you have a project directory and task description.",
          type: "error"
        });
        setIsCreatingPlan(false);
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
        setIsCreatingPlan(false);
        return;
      }

      console.log(`[handleCreateImplementationPlan][${timestamp}] Calling API with:`, {
        projectDir: projectDirectory,
        taskDescLength: taskDescription.length,
        sessionId: activeSessionId,
        includedPathsCount: includedPaths.length,
        fileContentsMapSize: Object.keys(fileContentsMap || {}).length
      });

      // More robust file content map handling
      const effectiveFileContentsMap = fileContentsMap || {};

      // Ensuring we have at least an empty string for each path
      const completeFileContentsMap = { ...effectiveFileContentsMap };
      includedPaths.forEach(path => {
        if (!completeFileContentsMap[path]) {
          completeFileContentsMap[path] = "";
        }
      });

      const result = await createImplementationPlanAction({
        projectDirectory,
        taskDescription,
        relevantFiles: includedPaths,
        fileContentsMap: completeFileContentsMap,
        sessionId: activeSessionId,
        temperatureOverride: undefined
      });

      // Ensure we reset state BEFORE showing notifications
      setIsCreatingPlan(false);

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
      setIsCreatingPlan(false); // Make sure to reset state on error
    }
  }, [projectDirectory, activeSessionId, showNotification]);

  /**
   * Copy implementation plan prompt to clipboard
   */
  const handleCopyImplementationPlanPrompt = useCallback(async (
    taskDescription: string,
    includedPaths: string[], 
    fileContentsMap: Record<string, string>
  ) => {
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
        relevantFiles: includedPaths,
        fileContentsMap
      });

      if (result.isSuccess && result.data?.prompt) {
        await navigator.clipboard.writeText(result.data.prompt);
        setPlanPromptCopySuccess(true);
        showNotification({
          title: "Prompt Copied",
          message: "Implementation plan prompt copied to clipboard.",
          type: "success",
          clipboardFeedback: true
        });
        setTimeout(() => setPlanPromptCopySuccess(false), 2000);
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

  /**
   * Get implementation plan prompt string
   * Returns the prompt string or null on error
   */
  const handleGetImplementationPlanPrompt = useCallback(async (
    taskDescription: string,
    includedPaths: string[],
    fileContentsMap: Record<string, string>
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
        relevantFiles: includedPaths,
        fileContentsMap
      });

      if (result.isSuccess && result.data?.prompt) {
        return result.data.prompt;
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

  return {
    // State
    isCreatingPlan,
    planPromptCopySuccess,
    isCopyingPlanPrompt,

    // Actions
    handleCreateImplementationPlan,
    handleCopyImplementationPlanPrompt,
    handleGetImplementationPlanPrompt
  };
}