"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

import { refineTaskDescriptionAction } from "@/actions/ai/task-refinement.actions";
import { getTaskDescriptionHistoryAction, syncTaskDescriptionHistoryAction } from "@/actions/session";
import { useBackgroundJob } from "@/contexts/_hooks/use-background-job";
import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import { useSessionActionsContext, useSessionStateContext } from "@/contexts/session";
import { extractErrorInfo, createUserFriendlyErrorMessage } from "@/utils/error-handling";

// Import TaskDescriptionHandle type directly
import type { TaskDescriptionHandle } from "../_components/task-description";

interface HistoryState {
  entries: string[];
  currentIndex: number;
}


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
  const [isRefiningTask, setIsRefiningTask] = useState(false);
  const [taskRefinementJobId, setTaskRefinementJobId] = useState<
    string | undefined
  >(undefined);

  // Undo/redo state
  const [historyState, setHistoryState] = useState<HistoryState>({
    entries: [sessionTaskDescription || ""],
    currentIndex: 0
  });
  const isNavigatingHistory = useRef(false);
  const initializedForSessionId = useRef<string | null>(null);

  // External hooks
  const { showNotification } = useNotification();
  // Fetch the background job using typed hook
  const taskRefinementJob = useBackgroundJob(taskRefinementJobId ?? null);
  


  // Reset function clears UI-related state
  const reset = useCallback(() => {
    setTaskCopySuccess(false);
    setIsRefiningTask(false);
    setTaskRefinementJobId(undefined);
  }, []);


  // Debounce timer for user edits ref
  const debounceTimerRef = useRef<number | null>(null);
  const historySyncTimerRef = useRef<number | null>(null);

  const saveToHistory = useCallback((description: string) => {
    setHistoryState(prev => {
      const newEntries = prev.entries.slice(0, prev.currentIndex + 1);
      const lastItem = newEntries[newEntries.length - 1];
      
      if (lastItem !== description) {
        newEntries.push(description);
        const trimmedEntries = newEntries.slice(-50); // Keep only last 50 entries
        return {
          entries: trimmedEntries,
          currentIndex: trimmedEntries.length - 1
        };
      }
      return prev;
    });
  }, []);


  // Task refinement job monitoring
  useEffect(() => {
    if (isSwitchingSession || !taskRefinementJobId || !taskRefinementJob.job) return;

    const job = taskRefinementJob.job;
    if (!job?.status) return;

    const handleJobCompletion = async () => {
      if (job.status === "completed" && job.response && job.sessionId === activeSessionId) {
        const refinedTask = String(job.response).trim();
        if (refinedTask) {
          saveToHistory(sessionTaskDescription);
          sessionActions.updateCurrentSessionFields({ taskDescription: refinedTask });
          sessionActions.setSessionModified(true);
          onInteraction?.();
          showNotification({ title: "Task refined", message: "Task description has been refined.", type: "success" });
        }
        setIsRefiningTask(false);
        setTaskRefinementJobId(undefined);
      } else if ((job.status === "failed" || job.status === "canceled") && job.sessionId === activeSessionId) {
        setIsRefiningTask(false);
        setTaskRefinementJobId(undefined);
        showNotification({ title: "Task refinement failed", message: job.errorMessage || "Failed to refine task description.", type: "error" });
      }
    };

    handleJobCompletion();
  }, [taskRefinementJob.job?.status, taskRefinementJobId, isSwitchingSession, activeSessionId, onInteraction, showNotification, saveToHistory, sessionTaskDescription, sessionActions]);


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

  // Handle task refinement
  const handleRefineTask = useCallback(async (): Promise<void> => {
    if (!sessionTaskDescription.trim()) {
      showNotification({
        title: "No task description",
        message: "Please enter a task description to refine.",
        type: "warning",
      });
      return;
    }

    if (isRefiningTask) {
      showNotification({
        title: "Already refining task",
        message: "Please wait for the current refinement to complete.",
        type: "warning",
      });
      return;
    }

    if (isSwitchingSession || !activeSessionId) {
      return;
    }

    // Set loading state
    setIsRefiningTask(true);

    try {
      // Get included files from session context
      const includedFiles = sessionState.currentSession?.includedFiles || [];

      // Call the task refinement action
      const result = await refineTaskDescriptionAction({
        taskDescription: sessionTaskDescription,
        projectDirectory,
        sessionId: activeSessionId,
        relevantFiles: includedFiles.length > 0 ? includedFiles : [],
      });

      if (result.isSuccess) {
        // Store job ID to track progress
        if (result.data?.jobId) {
          setTaskRefinementJobId(result.data.jobId);
        }
      } else {
        throw new Error(
          result.message || "Failed to start task refinement."
        );
      }
    } catch (error) {
      console.error("Error refining task:", error);
      setIsRefiningTask(false);

      // Extract error info and create user-friendly message
      const errorInfo = extractErrorInfo(error);
      const userFriendlyMessage = createUserFriendlyErrorMessage(errorInfo, 'task refinement');
      
      showNotification({
        title: "Error refining task",
        message: userFriendlyMessage,
        type: "error",
      });
    }
  }, [
    sessionTaskDescription,
    isRefiningTask,
    showNotification,
    isSwitchingSession,
    activeSessionId,
    sessionState.currentSession?.includedFiles,
    projectDirectory,
  ]);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      if (!isNavigatingHistory.current) {
        const currentHistoryItem = historyState.entries[historyState.currentIndex];
        if (sessionTaskDescription && sessionTaskDescription !== currentHistoryItem) {
          saveToHistory(sessionTaskDescription);
        }
      }
    }, 1000);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [sessionTaskDescription, historyState.entries, historyState.currentIndex, saveToHistory]);

  useEffect(() => {
    if (historySyncTimerRef.current) {
      clearTimeout(historySyncTimerRef.current);
    }

    historySyncTimerRef.current = window.setTimeout(async () => {
      if (activeSessionId && historyState.entries.length > 0) {
        try {
          await syncTaskDescriptionHistoryAction(activeSessionId, historyState.entries);
        } catch (error) {
          console.error('Failed to sync task description history:', error);
        }
      }
    }, 2000);

    return () => {
      if (historySyncTimerRef.current) {
        clearTimeout(historySyncTimerRef.current);
      }
    };
  }, [historyState.entries, activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || initializedForSessionId.current === activeSessionId) {
      if (!activeSessionId) {
        setHistoryState({ entries: [""], currentIndex: 0 });
        initializedForSessionId.current = null;
      }
      return;
    }

    const initializeHistory = async () => {
      try {
        const result = await getTaskDescriptionHistoryAction(activeSessionId);
        if (result.isSuccess && result.data && result.data.length > 0) {
          const historyEntries = result.data;
          const currentDesc = sessionTaskDescription;
          
          if (currentDesc && !historyEntries.includes(currentDesc)) {
            const updatedEntries = [...historyEntries, currentDesc];
            setHistoryState({ entries: updatedEntries, currentIndex: updatedEntries.length - 1 });
          } else {
            const currentIndex = currentDesc ? historyEntries.indexOf(currentDesc) : historyEntries.length - 1;
            setHistoryState({ entries: historyEntries, currentIndex: Math.max(0, currentIndex) });
          }
        } else if (sessionTaskDescription) {
          setHistoryState({ entries: [sessionTaskDescription], currentIndex: 0 });
        } else {
          setHistoryState({ entries: [""], currentIndex: 0 });
        }
        
        initializedForSessionId.current = activeSessionId;
      } catch (error) {
        console.error('Failed to load task description history:', error);
        if (sessionTaskDescription) {
          setHistoryState({ entries: [sessionTaskDescription], currentIndex: 0 });
        } else {
          setHistoryState({ entries: [""], currentIndex: 0 });
        }
        initializedForSessionId.current = activeSessionId;
      }
    };

    initializeHistory();
  }, [activeSessionId]);

  const undo = useCallback(() => {
    if (historyState.currentIndex > 0) {
      isNavigatingHistory.current = true;
      
      const newIndex = historyState.currentIndex - 1;
      const previousDescription = historyState.entries[newIndex];
      
      setHistoryState(prev => ({ ...prev, currentIndex: newIndex }));
      
      sessionActions.updateCurrentSessionFields({ taskDescription: previousDescription });
      sessionActions.setSessionModified(true);
      onInteraction?.();
      
      setTimeout(() => { isNavigatingHistory.current = false; }, 0);
    }
  }, [historyState.currentIndex, historyState.entries, sessionActions, onInteraction]);

  const redo = useCallback(() => {
    if (historyState.currentIndex < historyState.entries.length - 1) {
      isNavigatingHistory.current = true;
      
      const newIndex = historyState.currentIndex + 1;
      const nextDescription = historyState.entries[newIndex];
      
      setHistoryState(prev => ({ ...prev, currentIndex: newIndex }));
      
      sessionActions.updateCurrentSessionFields({ taskDescription: nextDescription });
      sessionActions.setSessionModified(true);
      onInteraction?.();
      
      setTimeout(() => { isNavigatingHistory.current = false; }, 0);
    }
  }, [historyState.currentIndex, historyState.entries, sessionActions, onInteraction]);

  // Can undo/redo checks
  const canUndo = historyState.currentIndex > 0;
  const canRedo = historyState.currentIndex < historyState.entries.length - 1;
  

  return useMemo(
    () => ({
      isRefiningTask,
      taskCopySuccess,
      taskDescriptionRef,
      canUndo,
      canRedo,

      // Actions
      handleRefineTask,
      copyTaskDescription,
      reset,
      undo,
      redo,
      saveToHistory,
    }),
    [
      isRefiningTask,
      taskCopySuccess,
      taskDescriptionRef,
      canUndo,
      canRedo,
      handleRefineTask,
      copyTaskDescription,
      reset,
      undo,
      redo,
      saveToHistory,
    ]
  );
}