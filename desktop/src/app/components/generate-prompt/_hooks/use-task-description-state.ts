"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

import { refineTaskDescriptionAction } from "@/actions/ai/task-refinement.actions";
import { getTaskDescriptionHistoryAction, addTaskDescriptionHistoryEntryAction } from "@/actions/session";
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
  const [isRefiningTask, setIsRefiningTask] = useState(false);
  const [taskRefinementJobId, setTaskRefinementJobId] = useState<
    string | undefined
  >(undefined);

  // Undo/redo state
  const [history, setHistory] = useState<string[]>(() => [
    sessionTaskDescription || ""
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

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

  // Save current description to history
  const saveToHistory = useCallback(async (description: string) => {
    console.log('[TaskDescriptionState] saveToHistory called:', {
      description: description?.substring(0, 50) + '...',
      currentHistoryIndex: historyIndex,
      historyLength: history.length,
      lastHistoryItem: history[history.length - 1]?.substring(0, 50) + '...'
    });
    
    let newHistoryCreated = false;
    let newIndex = historyIndex;
    
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      const lastItem = newHistory[newHistory.length - 1];
      
      if (lastItem !== description) {
        newHistory.push(description);
        newHistoryCreated = true;
        newIndex = newHistory.length - 1;
        console.log('[TaskDescriptionState] New history entry created:', {
          newIndex,
          newHistoryLength: newHistory.length
        });
        return newHistory;
      } else {
        console.log('[TaskDescriptionState] History entry skipped - duplicate');
      }
      return prev;
    });
    
    if (newHistoryCreated) {
      setHistoryIndex(newIndex);
    }
    
    if (newHistoryCreated && activeSessionId) {
      try {
        await addTaskDescriptionHistoryEntryAction(activeSessionId, description);
      } catch (error) {
        console.error('Failed to persist task description history:', error);
      }
    }
  }, [historyIndex, activeSessionId, history]);


  // Task refinement job monitoring
  useEffect(() => {
    if (isSwitchingSession || !taskRefinementJobId || !taskRefinementJob.job) return;

    const job = taskRefinementJob.job;
    if (!job?.status) return;

    const handleJobCompletion = async () => {
      if (job.status === "completed" && job.response && job.sessionId === activeSessionId) {
        const refinedTask = String(job.response).trim();
        if (refinedTask) {
          console.log('[TaskDescriptionState] Task refinement completed, saving to history');
          // Save to history first, then replace entire task description
          await saveToHistory(sessionTaskDescription);
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

  // Debounced useEffect to capture user edits
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer to save to history after user stops typing
    debounceTimerRef.current = window.setTimeout(() => {
      const currentHistoryItem = history[historyIndex];
      console.log('[TaskDescriptionState] Debounced history save check:', {
        sessionTaskDescription: sessionTaskDescription?.substring(0, 50) + '...',
        currentHistoryItem: currentHistoryItem?.substring(0, 50) + '...',
        shouldSave: sessionTaskDescription && sessionTaskDescription !== currentHistoryItem
      });
      
      if (sessionTaskDescription && sessionTaskDescription !== currentHistoryItem) {
        console.log('[TaskDescriptionState] Saving to history via debounce');
        saveToHistory(sessionTaskDescription);
      }
    }, 1000); // 1 second debounce

    // Cleanup on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [sessionTaskDescription, history, historyIndex, saveToHistory]);

  // Initialize history when session changes
  useEffect(() => {
    if (!activeSessionId) {
      setHistory([""]);
      setHistoryIndex(0);
      return;
    }

    const initializeHistory = async () => {
      try {
        const result = await getTaskDescriptionHistoryAction(activeSessionId);
        if (result.isSuccess && result.data && result.data.length > 0) {
          setHistory(result.data);
          setHistoryIndex(result.data.length - 1);
        } else if (sessionTaskDescription) {
          setHistory([sessionTaskDescription]);
          setHistoryIndex(0);
          await addTaskDescriptionHistoryEntryAction(activeSessionId, sessionTaskDescription);
        } else {
          setHistory([""]);
          setHistoryIndex(0);
        }
      } catch (error) {
        console.error('Failed to load task description history:', error);
        if (sessionTaskDescription) {
          setHistory([sessionTaskDescription]);
          setHistoryIndex(0);
        } else {
          setHistory([""]);
          setHistoryIndex(0);
        }
      }
    };

    initializeHistory();
  }, [activeSessionId, sessionTaskDescription]);

  // Undo function
  const undo = useCallback(() => {
    console.log('[TaskDescriptionState] Undo called:', { 
      historyIndex, 
      historyLength: history.length, 
      canUndo: historyIndex > 0,
      history: history.slice(-3) // Show last 3 items
    });
    
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const previousDescription = history[newIndex];
      console.log('[TaskDescriptionState] Undo executing:', { 
        newIndex, 
        previousDescription: previousDescription?.substring(0, 50) + '...' 
      });
      
      setHistoryIndex(newIndex);
      sessionActions.updateCurrentSessionFields({ taskDescription: previousDescription });
      sessionActions.setSessionModified(true);
      onInteraction?.();
    } else {
      console.log('[TaskDescriptionState] Undo blocked - no previous history available');
    }
  }, [historyIndex, history, sessionActions, onInteraction]);

  // Redo function
  const redo = useCallback(() => {
    console.log('[TaskDescriptionState] Redo called:', { 
      historyIndex, 
      historyLength: history.length, 
      canRedo: historyIndex < history.length - 1,
      history: history.slice(-3) // Show last 3 items
    });
    
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const nextDescription = history[newIndex];
      console.log('[TaskDescriptionState] Redo executing:', { 
        newIndex, 
        nextDescription: nextDescription?.substring(0, 50) + '...' 
      });
      
      setHistoryIndex(newIndex);
      sessionActions.updateCurrentSessionFields({ taskDescription: nextDescription });
      sessionActions.setSessionModified(true);
      onInteraction?.();
    } else {
      console.log('[TaskDescriptionState] Redo blocked - no forward history available');
    }
  }, [historyIndex, history, sessionActions, onInteraction]);

  // Can undo/redo checks
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  
  // Debug logging for undo/redo state
  useEffect(() => {
    console.log('[TaskDescriptionState] History state update:', {
      historyIndex,
      historyLength: history.length,
      canUndo,
      canRedo,
      currentDescription: sessionTaskDescription?.substring(0, 50) + '...',
      history: history.map((item, index) => ({
        index,
        content: item?.substring(0, 30) + '...',
        isCurrent: index === historyIndex
      }))
    });
  }, [historyIndex, history.length, canUndo, canRedo, sessionTaskDescription, history]);

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