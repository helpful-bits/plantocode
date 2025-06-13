"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

import { createTextCorrectionJobAction } from "@/actions/voice-transcription/correct-text";
import { useBackgroundJob } from "@/contexts/_hooks/use-background-job";
import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import { useSessionActionsContext, useSessionStateContext } from "@/contexts/session";
import { extractErrorInfo, createUserFriendlyErrorMessage } from "@/utils/error-handling";

// Import TaskDescriptionHandle type directly
import type { TaskDescriptionHandle } from "../_components/task-description";

interface UseTaskDescriptionStateProps {
  activeSessionId: string | null;
  taskDescriptionRef: React.RefObject<TaskDescriptionHandle | null>;
  isSwitchingSession?: boolean;
  onInteraction?: () => void;
}

export function useTaskDescriptionState({
  activeSessionId,
  taskDescriptionRef,
  isSwitchingSession = false,
  onInteraction,
}: UseTaskDescriptionStateProps) {
  // Get the necessary states from project and session contexts
  const { projectDirectory } = useProject();
  const sessionActions = useSessionActionsContext();
  const sessionState = useSessionStateContext();
  
  // Get taskDescription from session context 
  const sessionTaskDescription = sessionState.currentSession?.taskDescription || "";

  // State for UI feedback and improvement features only
  const [taskCopySuccess, setTaskCopySuccess] = useState(false);
  const [isImprovingText, setIsImprovingText] = useState(false);
  const [textImprovementJobId, setTextImprovementJobId] = useState<
    string | undefined
  >(undefined);

  // External hooks
  const { showNotification } = useNotification();
  // Fetch the background job using typed hook
  const textImprovementJob = useBackgroundJob(textImprovementJobId ?? null);
  


  // Reset function clears UI-related state
  const reset = useCallback(() => {
    setTaskCopySuccess(false);
    setIsImprovingText(false);
    setTextImprovementJobId(undefined);
  }, []);

  // Store selection range for text improvement
  const selectionRangeRef = useRef<{
    start: number;
    end: number;
    text: string;
    originalTaskDescription: string;
  } | null>(null);

  // Simplified job monitoring
  useEffect(() => {
    if (isSwitchingSession || !textImprovementJobId || !textImprovementJob.job) return;

    const job = textImprovementJob.job;
    if (!job?.status) return;

    if (job.status === "completed" && job.response && job.sessionId === activeSessionId && selectionRangeRef.current) {
      const improvedText = String(job.response).trim();
      if (improvedText) {
        const { start, end, originalTaskDescription } = selectionRangeRef.current;
        const newTaskDescription = originalTaskDescription.substring(0, start) + improvedText + originalTaskDescription.substring(end);
        sessionActions.updateCurrentSessionFields({ taskDescription: newTaskDescription });
        sessionActions.setSessionModified(true);
        onInteraction?.();
        showNotification({ title: "Text improved", message: "Selected text improved.", type: "success" });
      }
      setIsImprovingText(false);
      setTextImprovementJobId(undefined);
      selectionRangeRef.current = null;
    } else if ((job.status === "failed" || job.status === "canceled") && job.sessionId === activeSessionId) {
      setIsImprovingText(false);
      setTextImprovementJobId(undefined);
      selectionRangeRef.current = null;
      showNotification({ title: "Text improvement failed", message: job.errorMessage || "Failed to improve text.", type: "error" });
    }
  }, [textImprovementJob.job?.status, textImprovementJobId, isSwitchingSession, activeSessionId, onInteraction, showNotification]);

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
          originalTaskDescription: sessionTaskDescription,
        };
      } else if (taskDescriptionRef.current) {
        const start = taskDescriptionRef.current.selectionStart;
        const end = taskDescriptionRef.current.selectionEnd;

        if (typeof start === "number" && typeof end === "number") {
          selectionRangeRef.current = { start, end, text: selectedText, originalTaskDescription: sessionTaskDescription };
        } else {
          // Fallback: find text in description
          const index = sessionTaskDescription.indexOf(selectedText);
          if (index >= 0) {
            selectionRangeRef.current = {
              start: index,
              end: index + selectedText.length,
              text: selectedText,
              originalTaskDescription: sessionTaskDescription,
            };
          } else {
            selectionRangeRef.current = null;
          }
        }
      }

      try {
        // Call the unified text correction action
        const result = await createTextCorrectionJobAction(
          selectedText,
          activeSessionId,
          null, // originalJobId
          projectDirectory
        );

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

        // Extract error info and create user-friendly message
        const errorInfo = extractErrorInfo(error);
        const userFriendlyMessage = createUserFriendlyErrorMessage(errorInfo, 'text improvement');
        
        showNotification({
          title: "Error improving text",
          message: userFriendlyMessage,
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
      sessionTaskDescription,
    ]
  );

  // Function to copy task description to clipboard
  const copyTaskDescription = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sessionTaskDescription);
      setTaskCopySuccess(true);
      
      setTimeout(() => {
        try {
          setTaskCopySuccess(prevState => {
            // Only update if still true to avoid race conditions
            return prevState ? false : prevState;
          });
        } catch (error) {
          console.error('[TaskDescriptionState] Error resetting copy success state:', error);
        }
      }, 2000);
      
      // Store timeout ID for potential cleanup (though not critical for short timeouts)
      return true;
    } catch (error) {
      console.error("Error copying task description:", error);
      return false;
    }
  }, [sessionTaskDescription]);

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