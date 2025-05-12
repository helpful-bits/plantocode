"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useBackgroundJob } from "@/lib/contexts/background-jobs-context";
import { improveSelectedTextAction } from "@/actions/text-improvement-actions";
import { useNotification } from '@/lib/contexts/notification-context';
import { useProject } from "@/lib/contexts/project-context";
import { useSessionContext } from "@/lib/contexts/session-context";
import { useAsyncAction } from "./use-async-state";

interface UseTaskDescriptionStateProps {
  activeSessionId: string | null;
  taskDescriptionRef: React.RefObject<HTMLTextAreaElement>;
  isSwitchingSession?: boolean;
  onInteraction?: () => void;
}

export function useTaskDescriptionState({
  activeSessionId,
  taskDescriptionRef,
  isSwitchingSession = false,
  onInteraction
}: UseTaskDescriptionStateProps) {
  // Get the necessary states from project and session contexts
  const { projectDirectory } = useProject();
  const sessionContext = useSessionContext();

  // Internal state for task description
  const [internalTaskDescription, setInternalTaskDescription] = useState<string>('');

  // State for UI feedback and improvement features
  const [taskCopySuccess, setTaskCopySuccess] = useState(false);
  const [isImprovingText, setIsImprovingText] = useState(false);
  const [textImprovementJobId, setTextImprovementJobId] = useState<string | null>(null);

  // External hooks
  const { showNotification } = useNotification();
  // Fetch the background job
  const textImprovementJob = useBackgroundJob(textImprovementJobId);

  // Initialize internal state from session when session changes
  useEffect(() => {
    // Log the current state of the session context
    console.log('[TaskDescriptionState] Session context state:', {
      isSwitchingSession,
      currentSession: sessionContext.currentSession ? 'exists' : 'null',
      activeSessionId: sessionContext.activeSessionId,
      taskDescription: sessionContext.currentSession?.taskDescription ?
        `${sessionContext.currentSession.taskDescription.substring(0, 20)}${sessionContext.currentSession.taskDescription.length > 20 ? '...' : ''}` : 'empty'
    });

    // During a session transition, we DON'T want to clear the task description
    // This was causing the empty state during loading
    if (!sessionContext.currentSession) {
      console.log('[TaskDescriptionState] No current session, waiting for session to load');
      return; // Don't update state at all when there's no session
    }

    // The key fix: don't clear task description during transitions
    // If we're switching sessions, keep the current task description unless
    // the new session's task description is explicitly available
    if (isSwitchingSession && !sessionContext.currentSession.taskDescription) {
      console.log('[TaskDescriptionState] Keeping existing task description during transition');
      return;
    }

    // If we have a valid session, initialize from it
    const sessionTaskDescription = sessionContext.currentSession.taskDescription || '';
    console.log('[TaskDescriptionState] Initializing internal state from session:',
      sessionTaskDescription.substring(0, 20) + (sessionTaskDescription.length > 20 ? '...' : ''));

    // Update internal state regardless of whether task description is empty or not
    setInternalTaskDescription(sessionTaskDescription);
    console.log('[TaskDescriptionState] Updated internal state with task description:',
      sessionTaskDescription ?
      `${sessionTaskDescription.substring(0, 20)}${sessionTaskDescription.length > 20 ? '...' : ''}` :
      '(empty string)');
  }, [
    sessionContext.currentSession,
    sessionContext.activeSessionId, // React to changes in activeSessionId
    isSwitchingSession
  ]);

  // Reset function clears UI-related state - wrapped in useCallback for stability
  const reset = useCallback(() => {
    console.log('[TaskDescriptionState] Resetting task description UI state');
    // Reset local UI state
    setTaskCopySuccess(false);
    setIsImprovingText(false);
    setTextImprovementJobId(null);
  }, []);

  // Store selection range for text improvement
  const selectionRangeRef = useRef<{start: number; end: number; text: string} | null>(null);

  // Monitor background job for text improvement
  useEffect(() => {
    // Don't process job updates during session switching to prevent stale data being applied
    if (isSwitchingSession) {
      console.log('[TaskDescriptionState] Suppressed job processing: session switch in progress');
      return;
    }

    if (textImprovementJobId && textImprovementJob) {
      if (textImprovementJob.job && textImprovementJob.job.status === 'completed' && textImprovementJob.job.response) {
        // Job completed successfully
        setIsImprovingText(false);

        try {
          // Use the session ID from context for consistent session identification
          const currentActiveSessionId = sessionContext.activeSessionId;

          // Check if the job belongs to the current active session
          if (textImprovementJob.job.sessionId === currentActiveSessionId) {
            // Parse the response if it's JSON, or use as-is if it's a string
            const improvedText = (() => {
              try {
                const parsed = JSON.parse(textImprovementJob.job.response);
                return parsed.text || parsed.improvedText || textImprovementJob.job.response;
              } catch (e) {
                // If not valid JSON, assume it's just a string
                return textImprovementJob.job.response;
              }
            })();

            // If we have a valid text response and selection range
            if (typeof improvedText === 'string' && improvedText.trim() && selectionRangeRef.current) {
              const { start, end } = selectionRangeRef.current;

              // CHANGED: Use internal state instead of session context
              const currentValue = internalTaskDescription;
              const newValue = currentValue.substring(0, start) + improvedText + currentValue.substring(end);

              // Update internal state
              setInternalTaskDescription(newValue);

              // Update the textarea value if needed
              if (taskDescriptionRef.current) {
                taskDescriptionRef.current.value = newValue;
              }

              // Call onInteraction to notify parent components of a change
              if (onInteraction) {
                onInteraction();
              }

              showNotification({
                title: "Text improved",
                message: "The selected text has been improved.",
                type: "success"
              });
            } else {
              console.error("[TaskDescriptionState] Invalid improved text format:", improvedText);
              showNotification({
                title: "Text improvement error",
                message: "Received invalid format for improved text or missing selection range.",
                type: "error"
              });
            }
          } else {
            console.warn('[TaskDescriptionState] Text improvement for a non-active session completed. Ignoring update.');
          }
        } catch (error) {
          console.error("[TaskDescriptionState] Error processing text improvement response:", error);
          showNotification({
            title: "Error processing improvement",
            message: "Failed to process the improved text response.",
            type: "error"
          });
        }

        // Always reset the job ID and selection range reference after processing completed status
        setTextImprovementJobId(null);
        selectionRangeRef.current = null;
      } else if (textImprovementJob.job && (textImprovementJob.job.status === 'failed' || textImprovementJob.job.status === 'canceled')) {
        // Job failed or was canceled
        setIsImprovingText(false);

        // Use the session ID from context for consistent session identification
        const currentActiveSessionId = sessionContext.activeSessionId;

        // Only show notification if the job belongs to the current active session
        if (textImprovementJob.job.sessionId === currentActiveSessionId) {
          showNotification({
            title: "Text improvement failed",
            message: textImprovementJob.job.errorMessage || "Failed to improve text.",
            type: "error"
          });
        } else {
          console.warn('[TaskDescriptionState] Text improvement for a non-active session failed/canceled. Suppressing notification.');
        }

        // Always reset the job ID and selection range reference after processing failed or canceled status
        setTextImprovementJobId(null);
        selectionRangeRef.current = null;
      }
    }
  }, [
    textImprovementJob,
    textImprovementJobId,
    isSwitchingSession,
    showNotification,
    sessionContext,
    internalTaskDescription,
    taskDescriptionRef,
    onInteraction
  ]);

  // Handle text improvement
  const handleImproveSelection = useCallback(async (selectedText: string, selectionStart?: number, selectionEnd?: number): Promise<void> => {
    if (!selectedText || selectedText.trim() === '') {
      showNotification({
        title: "No text selected",
        message: "Please select some text to improve.",
        type: "warning"
      });
      return;
    }

    if (isImprovingText) {
      showNotification({
        title: "Already improving text",
        message: "Please wait for the current improvement to complete.",
        type: "warning"
      });
      return;
    }

    if (isSwitchingSession) {
      return;
    }

    // Use the session ID from context
    const currentActiveSessionId = sessionContext.activeSessionId;

    // Validate that we have a session ID
    if (!currentActiveSessionId) {
      console.error(`[TaskDescriptionState] No active session ID found`);
      showNotification({
        title: "Error",
        message: "No active session",
        type: "error"
      });
      return;
    }

    setIsImprovingText(true);

    try {
      console.log("[TaskDescriptionState] Improving selected text:", selectedText.substring(0, 50) + "...");

      // CHANGED: Use internal state instead of session context
      const currentTaskDescription = internalTaskDescription;

      // If we have selection start and end positions, store them for later use
      if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
        console.log(`[TaskDescriptionState] Storing selection range: ${selectionStart}-${selectionEnd}`);
        selectionRangeRef.current = {
          start: selectionStart,
          end: selectionEnd,
          text: selectedText
        };
      } else if (taskDescriptionRef.current) {
        // Try to get selection from the textarea element
        const start = taskDescriptionRef.current.selectionStart;
        const end = taskDescriptionRef.current.selectionEnd;

        if (typeof start === 'number' && typeof end === 'number') {
          console.log(`[TaskDescriptionState] Getting selection range from textarea: ${start}-${end}`);
          selectionRangeRef.current = {
            start,
            end,
            text: selectedText
          };
        } else {
          // Fallback: try to find the text in the task description
          console.log(`[TaskDescriptionState] No selection range provided, searching for text in task description`);
          const index = currentTaskDescription.indexOf(selectedText);
          if (index >= 0) {
            selectionRangeRef.current = {
              start: index,
              end: index + selectedText.length,
              text: selectedText
            };
          } else {
            console.warn("[TaskDescriptionState] Couldn't determine selection range for text improvement");
            selectionRangeRef.current = null;
          }
        }
      }

      // Ensure we pass the text correctly to the action with targetField
      const result = await improveSelectedTextAction({
        text: selectedText,
        sessionId: currentActiveSessionId,
        projectDirectory, // Include project directory
        targetField: 'taskDescription' // Explicitly set targetField
      });

      if (result.isSuccess) {
        // Check for background job format
        if (result.data && typeof result.data === 'object' && 'isBackgroundJob' in result.data && result.data.jobId) {
          console.log("[TaskDescriptionState] Text improvement queued as background job:", result.data.jobId);
          setTextImprovementJobId(result.data.jobId);
        } else if (typeof result.data === 'string') {
          // Handle immediate text improvement result
          console.log("[TaskDescriptionState] Text improvement completed immediately");

          // Check if we have a valid selection range and apply the improved text
          if (selectionRangeRef.current) {
            const { start, end } = selectionRangeRef.current;
            const newValue = currentTaskDescription.substring(0, start) + result.data + currentTaskDescription.substring(end);

            // CHANGED: Update internal state instead of SessionContext
            setInternalTaskDescription(newValue);

            // Update the textarea value if needed
            if (taskDescriptionRef.current) {
              taskDescriptionRef.current.value = newValue;
            }

            // Call onInteraction to notify parent components of a change
            if (onInteraction) {
              onInteraction();
            }

            selectionRangeRef.current = null;
          }

          showNotification({
            title: "Text improved",
            message: "The selected text has been improved.",
            type: "success"
          });

          setIsImprovingText(false);
        } else {
          // Unexpected data format but still success
          console.warn("[TaskDescriptionState] Unexpected success data format:", result.data);
          setIsImprovingText(false);
          selectionRangeRef.current = null;

          showNotification({
            title: "Text improvement result",
            message: "Received unexpected result format.",
            type: "warning"
          });
        }
      } else {
        // Handle unsuccessful result
        throw new Error(result.message || "Failed to start text improvement.");
      }
    } catch (error) {
      console.error("[TaskDescriptionState] Error improving text:", error);
      setIsImprovingText(false);
      selectionRangeRef.current = null;

      showNotification({
        title: "Error improving text",
        message: error instanceof Error ? error.message : "An unknown error occurred.",
        type: "error"
      });
    }
  }, [
    isImprovingText,
    showNotification,
    isSwitchingSession,
    taskDescriptionRef,
    projectDirectory,
    sessionContext,
    internalTaskDescription,
    onInteraction
  ]);

  // Function to copy task description to clipboard
  const copyTaskDescription = useCallback(async () => {
    try {
      // CHANGED: Use internal state instead of session context
      await navigator.clipboard.writeText(internalTaskDescription);
      setTaskCopySuccess(true);

      // Reset the copy success state after a delay
      setTimeout(() => {
        setTaskCopySuccess(false);
      }, 2000);

      return true;
    } catch (error) {
      console.error("[TaskDescriptionState] Error copying task description:", error);
      return false;
    }
  }, [internalTaskDescription]);

  // Update both internal state and session context
  const setTaskDescription = useCallback((value: string) => {
    // Update internal state
    setInternalTaskDescription(value);

    // Update textarea value if ref is available
    if (taskDescriptionRef.current) {
      taskDescriptionRef.current.value = value;
    }

    // Update session context directly
    sessionContext.updateCurrentSessionFields({ taskDescription: value });

    // Notify parent components of change
    if (onInteraction) {
      onInteraction();
    }
  }, [taskDescriptionRef, onInteraction, sessionContext]);

  return useMemo(() => ({
    // CHANGED: Return internal state instead of session state
    taskDescription: internalTaskDescription,
    isImprovingText,
    textImprovementJobId,
    taskCopySuccess,
    taskDescriptionRef,

    // Actions
    setTaskDescription,
    handleImproveSelection,
    copyTaskDescription,
    reset
  }), [
    // State values
    internalTaskDescription,
    isImprovingText,
    textImprovementJobId,
    taskCopySuccess,
    taskDescriptionRef,

    // Stable callback functions
    setTaskDescription,
    handleImproveSelection,
    copyTaskDescription,
    reset
  ]);
} 