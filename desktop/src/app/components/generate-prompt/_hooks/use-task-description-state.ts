"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

import { improveSelectedTextAction } from "@/actions/ai/text-improvement.actions";
import { useBackgroundJobs } from "@/contexts/background-jobs/useBackgroundJobs";
import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import { useSessionActionsContext } from "@/contexts/session";

// Import TaskDescriptionHandle type directly
import type { TaskDescriptionHandle } from "../_components/task-description";

interface UseTaskDescriptionStateProps {
  taskDescription: string;
  activeSessionId: string | null;
  taskDescriptionRef: React.RefObject<TaskDescriptionHandle | null>;
  isSwitchingSession?: boolean;
  onInteraction?: () => void;
}

export function useTaskDescriptionState({
  taskDescription,
  activeSessionId,
  taskDescriptionRef,
  isSwitchingSession = false,
  onInteraction,
}: UseTaskDescriptionStateProps) {
  // Get the necessary states from project and session contexts
  const { projectDirectory } = useProject();
  const sessionActions = useSessionActionsContext();

  // State for UI feedback and improvement features
  const [taskCopySuccess, setTaskCopySuccess] = useState(false);
  const [isImprovingText, setIsImprovingText] = useState(false);
  const [textImprovementJobId, setTextImprovementJobId] = useState<
    string | null
  >(null);

  // External hooks
  const { showNotification } = useNotification();
  // Fetch the background job
  const backgroundJobs = useBackgroundJobs();
  const textImprovementJobResult = textImprovementJobId && backgroundJobs.jobs 
    ? backgroundJobs.jobs.find(job => job.id === textImprovementJobId) 
    : null;
  
  // Type guard to check if a job object has a specific property
  const hasProperty = <T extends object, K extends string>(obj: T, prop: K): obj is T & Record<K, unknown> => {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  };


  // Reset function clears UI-related state
  const reset = useCallback(() => {
    setTaskCopySuccess(false);
    setIsImprovingText(false);
    setTextImprovementJobId(null);
  }, []);

  // Store selection range for text improvement
  const selectionRangeRef = useRef<{
    start: number;
    end: number;
    text: string;
  } | null>(null);

  // Monitor background job for text improvement
  useEffect(() => {
    // Skip job processing during session switching
    if (
      isSwitchingSession ||
      !textImprovementJobId ||
      !textImprovementJobResult
    ) {
      return;
    }

    const job = textImprovementJobResult;
    if (!job || typeof job !== 'object') {
      return;
    }

    if (hasProperty(job, 'status') && hasProperty(job, 'response') && job.status === "completed" && job.response) {
      // Job completed successfully
      setIsImprovingText(false);

      try {
        // Check if the job belongs to the current active session
        if (
          hasProperty(job, 'sessionId') && 
          job.sessionId === activeSessionId &&
          selectionRangeRef.current
        ) {
          // Parse the response - backend should return a clean string
          let improvedText = "";
          if (typeof job.response === "string") {
            improvedText = job.response;
          } else if (job.response && typeof job.response === "object") {
            try {
              const responseStr = typeof job.response === 'string' ? job.response : JSON.stringify(job.response);
              const parsedResponse = JSON.parse(responseStr) as { text?: string };
              improvedText = parsedResponse && typeof parsedResponse.text === "string" 
                ? parsedResponse.text 
                : "";
            } catch (err) {
              console.error("Error parsing job response:", err);
              improvedText = "";
            }
          }

          // Apply the improved text at the selection range
          if (improvedText && improvedText.trim()) {
            const { start, end } = selectionRangeRef.current;
            const currentValue = taskDescription;
            const newValue =
              currentValue.substring(0, start) +
              improvedText +
              currentValue.substring(end);

            // Update session
            sessionActions.updateCurrentSessionFields({
              taskDescription: newValue,
            });

            // Notify parent components
            if (onInteraction) {
              onInteraction();
            }

            showNotification({
              title: "Text improved",
              message: "The selected text has been improved.",
              type: "success",
            });
          }
        }
      } catch (error) {
        console.error("Error processing text improvement response:", error);
        showNotification({
          title: "Error processing improvement",
          message: "Failed to process the improved text response.",
          type: "error",
        });
      }

      // Always reset state after processing
      setTextImprovementJobId(null);
      selectionRangeRef.current = null;
    } else if (
      hasProperty(job, 'status') && 
      (job.status === "failed" || job.status === "canceled")
    ) {
      // Job failed or was canceled
      setIsImprovingText(false);
      setTextImprovementJobId(null);
      selectionRangeRef.current = null;

      // Only show notification for current session
      if (hasProperty(job, 'sessionId') && job.sessionId === activeSessionId) {
        const errorMsg = hasProperty(job, 'errorMessage') && typeof job.errorMessage === 'string' 
          ? job.errorMessage 
          : "Failed to improve text.";
          
        showNotification({
          title: "Text improvement failed",
          message: errorMsg,
          type: "error",
        });
      }
    }
  }, [
    textImprovementJobResult,
    textImprovementJobId,
    isSwitchingSession,
    showNotification,
    activeSessionId,
    sessionActions,
    taskDescription,
    taskDescriptionRef,
    onInteraction,
  ]);

  // Handle text improvement
  const handleImproveSelection = useCallback(
    async (
      selectedText: string,
      selectionStart?: number,
      selectionEnd?: number
    ): Promise<void> => {
      // Validation checks
      if (!selectedText.trim()) {
        showNotification({
          title: "No text selected",
          message: "Please select some text to improve.",
          type: "warning",
        });
        return;
      }

      if (isImprovingText) {
        showNotification({
          title: "Already improving text",
          message: "Please wait for the current improvement to complete.",
          type: "warning",
        });
        return;
      }

      if (isSwitchingSession || !activeSessionId) {
        return;
      }

      // Set loading state
      setIsImprovingText(true);

      // Store selection range
      if (
        typeof selectionStart === "number" &&
        typeof selectionEnd === "number"
      ) {
        selectionRangeRef.current = {
          start: selectionStart,
          end: selectionEnd,
          text: selectedText,
        };
      } else if (taskDescriptionRef.current) {
        const start = taskDescriptionRef.current.selectionStart;
        const end = taskDescriptionRef.current.selectionEnd;

        if (typeof start === "number" && typeof end === "number") {
          selectionRangeRef.current = { start, end, text: selectedText };
        } else {
          // Fallback: find text in description
          const index = taskDescription.indexOf(selectedText);
          if (index >= 0) {
            selectionRangeRef.current = {
              start: index,
              end: index + selectedText.length,
              text: selectedText,
            };
          } else {
            selectionRangeRef.current = null;
          }
        }
      }

      try {
        // Call the Tauri command via action
        const result = await improveSelectedTextAction({
          text: selectedText,
          sessionId: activeSessionId,
          projectDirectory,
          targetField: "taskDescription",
        });

        if (result.isSuccess && result.data?.jobId) {
          // Store job ID to track progress
          setTextImprovementJobId(result.data.jobId);
        } else {
          throw new Error(
            result.message || "Failed to start text improvement."
          );
        }
      } catch (error) {
        console.error("Error improving text:", error);
        setIsImprovingText(false);
        selectionRangeRef.current = null;

        showNotification({
          title: "Error improving text",
          message:
            error instanceof Error
              ? error.message
              : "An unknown error occurred.",
          type: "error",
        });
      }
    },
    [
      isImprovingText,
      showNotification,
      isSwitchingSession,
      activeSessionId,
      taskDescriptionRef,
      projectDirectory,
      taskDescription,
    ]
  );

  // Function to copy task description to clipboard
  const copyTaskDescription = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(taskDescription);
      setTaskCopySuccess(true);
      setTimeout(() => setTaskCopySuccess(false), 2000);
      return true;
    } catch (error) {
      console.error("Error copying task description:", error);
      return false;
    }
  }, [taskDescription]);

  return useMemo(
    () => ({
      isImprovingText,
      textImprovementJobId,
      taskCopySuccess,
      taskDescriptionRef,

      // Actions
      handleImproveSelection,
      copyTaskDescription,
      reset,
    }),
    [
      isImprovingText,
      textImprovementJobId,
      taskCopySuccess,
      taskDescriptionRef,
      handleImproveSelection,
      copyTaskDescription,
      reset,
    ]
  );
}