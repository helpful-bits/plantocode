"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

import { refineTaskDescriptionAction } from "@/actions/ai/task-refinement.actions";
import { startWebSearchWorkflowOrchestratorAction, cancelWorkflowAction } from "@/actions/workflows/workflow.actions";
import { getTaskDescriptionHistoryAction, syncTaskDescriptionHistoryAction } from "@/actions/session";
import { useBackgroundJob } from "@/contexts/_hooks/use-background-job";
import { useNotification } from "@/contexts/notification-context";
import { useExistingWorkflowTracker } from "@/hooks/use-workflow-tracker";
import { useProject } from "@/contexts/project-context";
import { useSessionActionsContext, useSessionStateContext } from "@/contexts/session";
import { extractErrorInfo, createUserFriendlyErrorMessage } from "@/utils/error-handling";

// Import TaskDescriptionHandle type directly
import type { TaskDescriptionHandle } from "../_components/task-description";
import type { WorkflowState } from "@/types/workflow-types";

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
  const [isWebRefiningTask, setIsWebRefiningTask] = useState(false);
  const [webSearchWorkflowId, setWebSearchWorkflowId] = useState<
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
  // Fetch the web search workflow state
  const webSearchResult = webSearchWorkflowId ? useExistingWorkflowTracker(webSearchWorkflowId, activeSessionId || '') : null;
  const webSearchTracker = webSearchResult?.workflowTracker || null;
  const [webSearchWorkflowState, setWebSearchWorkflowState] = useState<WorkflowState | null>(null);
  const [webSearchResults, setWebSearchResults] = useState<string[] | null>(null);
  
  // Update web search workflow state when tracker changes
  useEffect(() => {
    if (!webSearchTracker || !webSearchWorkflowId) {
      setWebSearchWorkflowState(null);
      return;
    }
    
    const updateState = async () => {
      try {
        const state = await webSearchTracker.getStatus();
        setWebSearchWorkflowState(state);
      } catch (error) {
        console.error('Failed to get web search workflow state:', error);
      }
    };
    
    updateState();
    
    // Subscribe to progress updates
    const unsubscribe = webSearchTracker.onProgress((state: WorkflowState) => {
      setWebSearchWorkflowState(state);
    });
    
    return () => {
      unsubscribe();
    };
  }, [webSearchTracker, webSearchWorkflowId, activeSessionId]);
  


  // Reset function clears UI-related state
  const reset = useCallback(() => {
    setTaskCopySuccess(false);
    setIsRefiningTask(false);
    setTaskRefinementJobId(undefined);
    setIsWebRefiningTask(false);
    setWebSearchWorkflowId(undefined);
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
          // The backend now returns structured content (original + refined)
          // Parse if it's structured, otherwise use the response as-is
          let finalTaskDescription = refinedTask;
          try {
            const parsed = JSON.parse(refinedTask);
            if (parsed.original && parsed.refined) {
              finalTaskDescription = parsed.original + "\n\n" + parsed.refined;
            }
          } catch {
            // Not structured JSON, use as-is
          }
          sessionActions.updateCurrentSessionFields({ taskDescription: finalTaskDescription });
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

  // Web search workflow monitoring
  useEffect(() => {
    if (isSwitchingSession || !webSearchWorkflowId || !webSearchWorkflowState) return;

    const workflow = webSearchWorkflowState;
    if (!workflow?.status) return;

    const handleWorkflowCompletion = async () => {
      if (workflow.status === "Completed" && webSearchTracker && workflow.sessionId === activeSessionId) {
        let results;
        try {
          results = await webSearchTracker.getResults();
        } catch (error) {
          console.error('Failed to get web search results:', error);
          return;
        }
        // Extract web search results from workflow results
        if (results.intermediateData?.webSearchResults && results.intermediateData.webSearchResults.length > 0) {
          // Store the results for the Apply button
          setWebSearchResults(results.intermediateData.webSearchResults);
          setIsWebRefiningTask(false);
          showNotification({ 
            title: "Web search completed", 
            message: "Research findings are ready. Click 'Apply' to add them to your task description.", 
            type: "success" 
          });
        } else {
          setIsWebRefiningTask(false);
          setWebSearchWorkflowId(undefined);
          showNotification({ 
            title: "No results found", 
            message: "Web search completed but no research findings were generated.", 
            type: "warning" 
          });
        }
      } else if ((workflow.status === "Failed" || workflow.status === "Canceled") && workflow.sessionId === activeSessionId) {
        setIsWebRefiningTask(false);
        setWebSearchWorkflowId(undefined);
        setWebSearchResults(null);
        showNotification({ title: "Web search failed", message: workflow.errorMessage || "Failed to enhance task description with web search.", type: "error" });
      }
    };

    handleWorkflowCompletion();
  }, [webSearchWorkflowState?.status, webSearchTracker, webSearchWorkflowId, isSwitchingSession, activeSessionId, showNotification]);

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

  // Handle web search workflow
  const handleWebRefineTask = useCallback(async (): Promise<void> => {
    if (!sessionTaskDescription.trim()) {
      showNotification({
        title: "No task description",
        message: "Please enter a task description to enhance.",
        type: "warning",
      });
      return;
    }

    if (isWebRefiningTask) {
      showNotification({
        title: "Already enhancing task",
        message: "Please wait for the current web search to complete.",
        type: "warning",
      });
      return;
    }

    if (isSwitchingSession || !activeSessionId) {
      return;
    }

    // Set loading state
    setIsWebRefiningTask(true);

    try {
      // Call the web search workflow action
      const result = await startWebSearchWorkflowOrchestratorAction({
        taskDescription: sessionTaskDescription,
        projectDirectory,
        sessionId: activeSessionId,
      });

      if (result.isSuccess) {
        // Store workflow ID to track progress
        if (result.data?.workflowId) {
          setWebSearchWorkflowId(result.data.workflowId);
        }
      } else {
        throw new Error(
          result.message || "Failed to start web search workflow."
        );
      }
    } catch (error) {
      console.error("Error starting web search:", error);
      setIsWebRefiningTask(false);

      // Extract error info and create user-friendly message
      const errorInfo = extractErrorInfo(error);
      const userFriendlyMessage = createUserFriendlyErrorMessage(errorInfo, 'web search workflow');
      
      showNotification({
        title: "Error starting web search",
        message: userFriendlyMessage,
        type: "error",
      });
    }
  }, [
    sessionTaskDescription,
    isWebRefiningTask,
    showNotification,
    isSwitchingSession,
    activeSessionId,
    projectDirectory,
  ]);

  // Handle canceling web search workflow
  const cancelWebSearch = useCallback(async (): Promise<void> => {
    if (!webSearchWorkflowId) {
      console.warn("No web search workflow ID to cancel");
      return;
    }

    if (!isWebRefiningTask) {
      console.warn("No active web search to cancel");
      return;
    }

    try {
      const result = await cancelWorkflowAction(webSearchWorkflowId);
      
      if (result.isSuccess) {
        // Reset state immediately
        setIsWebRefiningTask(false);
        setWebSearchWorkflowId(undefined);
        setWebSearchResults(null);
        
        showNotification({
          title: "Web search canceled",
          message: "The web search workflow has been canceled successfully.",
          type: "success",
        });
      } else {
        throw new Error(result.message || "Failed to cancel web search workflow.");
      }
    } catch (error) {
      console.error("Error canceling web search:", error);
      
      // Extract error info and create user-friendly message
      const errorInfo = extractErrorInfo(error);
      const userFriendlyMessage = createUserFriendlyErrorMessage(errorInfo, 'cancel web search');
      
      showNotification({
        title: "Error canceling web search",
        message: userFriendlyMessage,
        type: "error",
      });
    }
  }, [webSearchWorkflowId, isWebRefiningTask, showNotification]);

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
  
  // Apply web search results to task description
  const applyWebSearchResults = useCallback((resultsToApply?: string[]) => {
    // Use provided results or fallback to state
    const results = resultsToApply || webSearchResults;
    
    if (!results || results.length === 0) {
      return;
    }

    // Save current state to history before applying
    saveToHistory(sessionTaskDescription);
    
    // Format the task description with XML tags for LLM clarity
    const originalTask = sessionTaskDescription.trim();
    
    // Parse and format each search result
    const formattedResults = results.map((resultStr, index) => {
      try {
        const result = JSON.parse(resultStr);
        return `<research_finding index="${index + 1}">
  <title>${result.title || `Research Finding ${index + 1}`}</title>
  <content>
${result.findings || resultStr}
  </content>
</research_finding>`;
      } catch (e) {
        // If parsing fails, use the raw string
        return `<research_finding index="${index + 1}">
  <content>
${resultStr}
  </content>
</research_finding>`;
      }
    }).join('\n\n');
    
    // Create XML-formatted task description
    const finalTaskDescription = `<task_context>
  <original_task>
${originalTask}
  </original_task>
  
  <web_search_findings count="${results.length}">
${formattedResults}
  </web_search_findings>
</task_context>`;
    
    // Update the task description
    sessionActions.updateCurrentSessionFields({ taskDescription: finalTaskDescription });
    sessionActions.setSessionModified(true);
    onInteraction?.();
    
    // Clear the web search results after applying
    setWebSearchResults(null);
    setWebSearchWorkflowId(undefined);
    
    showNotification({ 
      title: "Research applied", 
      message: "Web search findings have been added to your task description.", 
      type: "success" 
    });
  }, [sessionTaskDescription, sessionActions, onInteraction, showNotification, saveToHistory]);

  return useMemo(
    () => ({
      isRefiningTask,
      isWebRefiningTask,
      taskCopySuccess,
      taskDescriptionRef,
      canUndo,
      canRedo,
      webSearchResults,

      // Actions
      handleRefineTask,
      handleWebRefineTask,
      cancelWebSearch,
      copyTaskDescription,
      reset,
      undo,
      redo,
      saveToHistory,
      applyWebSearchResults,
    }),
    [
      isRefiningTask,
      isWebRefiningTask,
      taskCopySuccess,
      taskDescriptionRef,
      canUndo,
      canRedo,
      webSearchResults,
      handleRefineTask,
      handleWebRefineTask,
      cancelWebSearch,
      copyTaskDescription,
      reset,
      undo,
      redo,
      saveToHistory,
      applyWebSearchResults,
    ]
  );
}