"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

import { refineTaskDescriptionAction } from "@/actions/ai/task-refinement.actions";
import { startWebSearchWorkflowOrchestratorAction, cancelWorkflowAction } from "@/actions/workflows/workflow.actions";
import { startWebSearchPromptsGenerationJobAction } from '@/actions/ai/web-search-workflow.actions';
import { getTaskDescriptionHistoryAction, syncTaskDescriptionHistoryAction } from "@/actions/session";
import { queueTaskDescriptionUpdate } from "@/actions/session/task-fields.actions";
import { listen } from '@tauri-apps/api/event';
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
  // Store original task description when refinement starts for conflict detection
  const [refinementOriginalTask, setRefinementOriginalTask] = useState<string | null>(null);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [promptsJobId, setPromptsJobId] = useState<string | null>(null);
  
  // Simplified web search state management
  interface WebSearchState {
    isLoading: boolean;
    workflowId: string | null;
    results: string[] | null;
    error: string | null;
  }
  
  const [webSearchState, setWebSearchState] = useState<WebSearchState>({
    isLoading: false,
    workflowId: null,
    results: null,
    error: null
  });

  // Undo/redo state
  const [historyState, setHistoryState] = useState<HistoryState>({
    entries: [sessionTaskDescription || ""],
    currentIndex: 0
  });
  const initializedForSessionId = useRef<string | null>(null);
  const isNavigatingHistoryRef = useRef(false);
  const lastRecordedHashRef = useRef<string>('');
  const syncTimerRef = useRef<number | null>(null);
  const lastSyncedChecksumRef = useRef<string>('');

  // External hooks
  const { showNotification } = useNotification();
  // Fetch the background job using typed hook
  const taskRefinementJob = useBackgroundJob(taskRefinementJobId ?? null);
  const promptsJob = useBackgroundJob(promptsJobId);
  // Note: We're removing the complex workflow tracker usage in favor of polling
  
  // Simplified workflow completion detection with polling and timeout
  useEffect(() => {
    if (!webSearchState.workflowId || !webSearchState.isLoading) return;

    const POLL_INTERVAL = 1000; // 1 second
    const TIMEOUT_DURATION = 720000; // 12 minutes
    let pollInterval: number;
    let timeoutTimer: number;
    let cancelled = false;

    const checkWorkflowStatus = async () => {
      if (cancelled) return;
      
      try {
        const { createWorkflowTracker } = await import('@/utils/workflow-utils');
        const tracker = await createWorkflowTracker(webSearchState.workflowId!, activeSessionId || '');
        
        try {
          const status = await tracker.getStatus();
          
          // Check for ANY terminal state
          if (status.status === 'Completed' || 
              status.status === 'Failed' || 
              status.status === 'Canceled') {
            
            // Always clear loading state for terminal states
            let results: string[] | null = null;
            let error: string | null = null;
            
            if (status.status === 'Completed') {
              try {
                const workflowResults = await tracker.getResults();
                results = workflowResults.intermediateData?.webSearchResults || null;
                
                // Show appropriate notification
                if (results && results.length > 0) {
                  showNotification({ 
                    title: "Web search completed", 
                    message: "Research findings are ready. Click 'Apply' to add them to your task description.", 
                    type: "success" 
                  });
                } else {
                  showNotification({ 
                    title: "No results found", 
                    message: "Web search completed but no research findings were generated.", 
                    type: "warning" 
                  });
                }
              } catch (e) {
                error = 'Failed to fetch results';
                console.error('Failed to get web search results:', e);
              }
            } else if (status.status === 'Failed') {
              error = status.errorMessage || 'Workflow failed';
              showNotification({ 
                title: "Web search failed", 
                message: error, 
                type: "error" 
              });
            } else if (status.status === 'Canceled') {
              error = 'Workflow cancelled';
              // Don't show notification for user-initiated cancellation
            }
            
            // Update state atomically
            setWebSearchState({
              isLoading: false,
              workflowId: null,
              results,
              error
            });
            
            // Cleanup
            clearInterval(pollInterval);
            clearTimeout(timeoutTimer);
            cancelled = true;
          }
        } finally {
          // Always destroy tracker after use
          tracker.destroy();
        }
      } catch (error) {
        console.error('Error checking workflow status:', error);
        // Don't clear loading state on transient errors
      }
    };

    // Start polling
    checkWorkflowStatus(); // Initial check
    pollInterval = window.setInterval(checkWorkflowStatus, POLL_INTERVAL);
    
    // Timeout fallback - ALWAYS clear loading state after timeout
    timeoutTimer = window.setTimeout(() => {
      if (!cancelled) {
        setWebSearchState({
          isLoading: false,
          workflowId: null,
          results: null,
          error: 'Workflow timed out after 12 minutes'
        });
        clearInterval(pollInterval);
        showNotification({ 
          title: "Web search timed out", 
          message: "The research task took too long and was stopped.", 
          type: "error" 
        });
      }
    }, TIMEOUT_DURATION);

    // Cleanup function
    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      clearTimeout(timeoutTimer);
    };
  }, [webSearchState.workflowId, webSearchState.isLoading, activeSessionId, showNotification]);


  // Reset function clears UI-related state
  const reset = useCallback(() => {
    setTaskCopySuccess(false);
    setIsRefiningTask(false);
    setTaskRefinementJobId(undefined);
    setRefinementOriginalTask(null);
    setWebSearchState({
      isLoading: false,
      workflowId: null,
      results: null,
      error: null
    });
  }, []);


  const recordTaskChange = useCallback((source: 'typing' | 'paste' | 'voice' | 'improvement' | 'refine' | 'remote', value: string) => {
    if (isNavigatingHistoryRef.current) return; // Guard undo/redo echoes

    const normalized = value ?? '';
    const last = historyState.entries[historyState.entries.length - 1] ?? '';

    // Dedupe: skip if same as last entry
    if (normalized === last) return;

    // Compute hash for additional deduplication
    const hash = `${source}:${normalized}`;
    if (hash === lastRecordedHashRef.current) return;
    lastRecordedHashRef.current = hash;

    setHistoryState(prev => {
      const newEntries = prev.entries.slice(0, prev.currentIndex + 1);
      newEntries.push(normalized);

      // Cap at 200 entries
      const trimmedEntries = newEntries.slice(-200);
      return {
        entries: trimmedEntries,
        currentIndex: trimmedEntries.length - 1
      };
    });
  }, [historyState.entries]);

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


  // Task refinement job monitoring with conflict detection
  useEffect(() => {
    if (isSwitchingSession || !taskRefinementJobId || !taskRefinementJob.job) return;

    const job = taskRefinementJob.job;
    if (!job?.status) return;

    const handleJobCompletion = async () => {
      if (job.status === "completed" && job.response && job.sessionId === activeSessionId) {
        const refinedTask = String(job.response).trim();
        if (refinedTask) {
          // CONFLICT DETECTION: Check if task description changed while refinement was running
          if (refinementOriginalTask !== null && refinementOriginalTask !== sessionTaskDescription) {
            console.warn(
              "Task description changed during refinement. Original:",
              refinementOriginalTask.substring(0, 100),
              "Current:",
              sessionTaskDescription.substring(0, 100)
            );

            showNotification({
              title: "Task was modified",
              message: "The task description changed while refinement was running. Refined version not applied to avoid overwriting your changes.",
              type: "warning",
            });

            // Clean up state
            setIsRefiningTask(false);
            setTaskRefinementJobId(undefined);
            setRefinementOriginalTask(null);
            return;
          }

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
          if (taskDescriptionRef.current?.setValue) {
            taskDescriptionRef.current.setValue(finalTaskDescription);
          }
          // Record the refined task in history so undo/redo and state sync work correctly
          recordTaskChange('refine', finalTaskDescription);
          // Update session context immediately to keep it in sync with the textarea
          sessionActions.updateCurrentSessionFields({ taskDescription: finalTaskDescription });
          if (activeSessionId) {
            queueTaskDescriptionUpdate(activeSessionId, finalTaskDescription).catch(err => {
              console.error("Failed to queue task description after refinement:", err);
            });
          }
          onInteraction?.();
          showNotification({ title: "Task refined", message: "Task description has been refined.", type: "success" });
        }
        setIsRefiningTask(false);
        setTaskRefinementJobId(undefined);
        setRefinementOriginalTask(null);
      } else if ((job.status === "failed" || job.status === "canceled") && job.sessionId === activeSessionId) {
        setIsRefiningTask(false);
        setTaskRefinementJobId(undefined);
        setRefinementOriginalTask(null);
        showNotification({ title: "Task refinement failed", message: job.errorMessage || "Failed to refine task description.", type: "error" });
      }
    };

    handleJobCompletion();
  }, [taskRefinementJob.job?.status, taskRefinementJobId, isSwitchingSession, activeSessionId, onInteraction, showNotification, saveToHistory, sessionTaskDescription, sessionActions, refinementOriginalTask]);

  // Prompts generation job monitoring
  useEffect(() => {
    if (!promptsJob.job || !isGeneratingPrompts) return;

    if (promptsJob.job.status === 'completed') {
      setIsGeneratingPrompts(false);
      setPromptsJobId(null);
      showNotification({ title: "Prompts generated", message: "Search prompts are ready in the sidebar.", type: "success" });
    } else if (promptsJob.job.status === 'failed' || promptsJob.job.status === 'canceled') {
      setIsGeneratingPrompts(false);
      setPromptsJobId(null);
      showNotification({ title: "Prompt generation failed", message: promptsJob.job.errorMessage || "Failed to generate search prompts.", type: "error" });
    }
  }, [promptsJob.job?.status, isGeneratingPrompts, showNotification]);

  // Note: Old web search workflow monitoring effect removed - now handled by polling effect above

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
      // CRITICAL: Flush any pending session changes to backend BEFORE creating the job
      // This ensures the job will see the latest task description and session state
      await sessionActions.flushSaves();

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
        // Store job ID to track progress and original task for conflict detection
        if (result.data?.jobId) {
          setRefinementOriginalTask(sessionTaskDescription);
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
    sessionActions,
  ]);

  // Handle web search workflow
  const handleWebRefineTask = useCallback(async (justPrompts?: boolean): Promise<void> => {
    if (!sessionTaskDescription.trim()) {
      showNotification({
        title: "No task description",
        message: "Please enter a task description to enhance.",
        type: "warning",
      });
      return;
    }

    if (webSearchState.isLoading) {
      showNotification({
        title: "Already enhancing task",
        message: "Please wait for the current web search to complete.",
        type: "warning",
      });
      return;
    }

    if (isGeneratingPrompts) {
      showNotification({
        title: "Already generating prompts",
        message: "Please wait for the current request to complete.",
        type: "warning",
      });
      return;
    }

    if (isSwitchingSession || !activeSessionId) {
      return;
    }

    try {
      // CRITICAL: Flush any pending session changes to backend BEFORE creating jobs/workflows
      // This ensures the jobs will see the latest task description and session state
      await sessionActions.flushSaves();

      if (justPrompts) {
        setIsGeneratingPrompts(true);
        const result = await startWebSearchPromptsGenerationJobAction({
          taskDescription: sessionTaskDescription,
          projectDirectory,
          sessionId: activeSessionId!,
        });

        if (result.isSuccess && result.data?.jobId) {
          setPromptsJobId(result.data.jobId);
        } else {
          throw new Error(result.message || "Failed to start prompt generation job.");
        }
      } else {
        const result = await startWebSearchWorkflowOrchestratorAction({
          taskDescription: sessionTaskDescription,
          projectDirectory,
          sessionId: activeSessionId!,
        });

        if (result.isSuccess && result.data?.workflowId) {
          setWebSearchState({
            isLoading: true,
            workflowId: result.data.workflowId,
            results: null,
            error: null
          });
        } else {
          throw new Error(result.message || "Failed to start web search workflow.");
        }
      }
    } catch (error) {
      setIsGeneratingPrompts(false);
      console.error("Failed to start web research:", error);

      showNotification({
        title: "Failed to start research",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
        type: "error",
      });
    }
  }, [
    sessionTaskDescription,
    webSearchState.isLoading,
    isGeneratingPrompts,
    showNotification,
    isSwitchingSession,
    activeSessionId,
    projectDirectory,
    sessionActions,
  ]);

  // Handle canceling web search workflow
  const cancelWebSearch = useCallback(async (): Promise<void> => {
    if (!webSearchState.workflowId || !webSearchState.isLoading) return;
    
    try {
      await cancelWorkflowAction(webSearchState.workflowId);
    } catch (error) {
      console.error('Error canceling workflow:', error);
    }
    
    // Always clear state regardless of cancellation success
    setWebSearchState({
      isLoading: false,
      workflowId: null,
      results: null,
      error: 'Workflow cancelled'
    });
    
    showNotification({
      title: "Web search canceled",
      message: "The web search workflow has been canceled successfully.",
      type: "success",
    });
  }, [webSearchState.workflowId, webSearchState.isLoading, showNotification]);

  // Removed: debounced saveToHistory effect - now using recordTaskChange with explicit calls from components


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

  // Listen for local changes from decoupled components
  useEffect(() => {
    const onLocalChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { sessionId, value, source } = customEvent.detail || {};
      if (!activeSessionId || sessionId !== activeSessionId) return;
      recordTaskChange(source ?? 'typing', value ?? '');
    };

    window.addEventListener('task-description-local-change', onLocalChange);

    return () => {
      window.removeEventListener('task-description-local-change', onLocalChange);
    };
  }, [activeSessionId, recordTaskChange]);

  // Listen for history sync events from backend
  useEffect(() => {
    if (!activeSessionId) return;

    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<{ sessionId: string; taskDescription: string }>('session-history-synced', async (evt) => {
        const { sessionId } = evt.payload || {};
        if (!activeSessionId || sessionId !== activeSessionId) return;

        try {
          const result = await getTaskDescriptionHistoryAction(activeSessionId);
          if (result.isSuccess && result.data && result.data.length > 0) {
            setHistoryState({
              entries: result.data,
              currentIndex: result.data.length - 1
            });
          }
        } catch (error) {
          console.error('Failed to refresh history after sync:', error);
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [activeSessionId]);

  // Periodic sync to backend (2s interval)
  // Note: We use a ref to access current history state to avoid recreating the interval
  const historyEntriesRef = useRef(historyState.entries);
  historyEntriesRef.current = historyState.entries;

  useEffect(() => {
    if (!activeSessionId) return;

    const computeChecksum = (entries: string[]) => {
      // Better checksum: count + length of each entry + sample from each
      return `${entries.length}:${entries.map(e => e.length).join(',')}:${entries.map(e => e.slice(0, 20) + e.slice(-20)).join('|')}`;
    };

    syncTimerRef.current = window.setInterval(() => {
      const entries = historyEntriesRef.current;
      if (!entries || entries.length === 0) return;

      const checksum = computeChecksum(entries);
      if (checksum === lastSyncedChecksumRef.current) return;

      syncTaskDescriptionHistoryAction(activeSessionId, entries)
        .then(() => {
          lastSyncedChecksumRef.current = checksum;
        })
        .catch(() => {
          // Swallow transient errors
        });
    }, 2000);

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [activeSessionId]); // Removed historyState.entries dependency to prevent interval recreation

  const undo = useCallback(() => {
    if (historyState.currentIndex > 0) {
      isNavigatingHistoryRef.current = true;

      try {
        const newIndex = historyState.currentIndex - 1;
        const previousDescription = historyState.entries[newIndex];

        setHistoryState(prev => ({ ...prev, currentIndex: newIndex }));

        if (taskDescriptionRef.current?.setValue) {
          taskDescriptionRef.current.setValue(previousDescription);
        }
        // Update session context to keep it in sync
        sessionActions.updateCurrentSessionFields({ taskDescription: previousDescription });
        if (activeSessionId) {
          queueTaskDescriptionUpdate(activeSessionId, previousDescription).catch(err => {
            console.error("Failed to queue task description after undo:", err);
          });
        }
        onInteraction?.();
      } finally {
        // Reset after microtask
        queueMicrotask(() => {
          isNavigatingHistoryRef.current = false;
        });
      }
    }
  }, [historyState.currentIndex, historyState.entries, taskDescriptionRef, activeSessionId, onInteraction]);

  const redo = useCallback(() => {
    if (historyState.currentIndex < historyState.entries.length - 1) {
      isNavigatingHistoryRef.current = true;

      try {
        const newIndex = historyState.currentIndex + 1;
        const nextDescription = historyState.entries[newIndex];

        setHistoryState(prev => ({ ...prev, currentIndex: newIndex }));

        if (taskDescriptionRef.current?.setValue) {
          taskDescriptionRef.current.setValue(nextDescription);
        }
        // Update session context to keep it in sync
        sessionActions.updateCurrentSessionFields({ taskDescription: nextDescription });
        if (activeSessionId) {
          queueTaskDescriptionUpdate(activeSessionId, nextDescription).catch(err => {
            console.error("Failed to queue task description after redo:", err);
          });
        }
        onInteraction?.();
      } finally {
        // Reset after microtask
        queueMicrotask(() => {
          isNavigatingHistoryRef.current = false;
        });
      }
    }
  }, [historyState.currentIndex, historyState.entries, taskDescriptionRef, activeSessionId, onInteraction]);

  // Can undo/redo checks
  const canUndo = historyState.currentIndex > 0;
  const canRedo = historyState.currentIndex < historyState.entries.length - 1;
  
  // Apply web search results to task description
  const applyWebSearchResults = useCallback((resultsToApply?: string[]) => {
    // Use provided results or fallback to state
    const results = resultsToApply || webSearchState.results;
    
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
    if (taskDescriptionRef.current?.setValue) {
      taskDescriptionRef.current.setValue(finalTaskDescription);
    }
    // Record the web search results in history
    recordTaskChange('improvement', finalTaskDescription);
    // Update session context immediately to keep it in sync
    sessionActions.updateCurrentSessionFields({ taskDescription: finalTaskDescription });
    if (activeSessionId) {
      queueTaskDescriptionUpdate(activeSessionId, finalTaskDescription).catch(err => {
        console.error("Failed to queue task description after web search:", err);
      });
    }
    onInteraction?.();

    // Clear the web search results after applying
    setWebSearchState(prev => ({ ...prev, results: null }));

    showNotification({
      title: "Research applied",
      message: "Web search findings have been added to your task description.",
      type: "success"
    });
  }, [sessionTaskDescription, taskDescriptionRef, activeSessionId, onInteraction, showNotification, saveToHistory, webSearchState.results]);

  // Add safety cleanup on component unmount
  useEffect(() => {
    return () => {
      // Force clear loading state on unmount
      setWebSearchState(prev => ({
        ...prev,
        isLoading: false,
        workflowId: null
      }));
    };
  }, []);

  // Clear any active workflows when switching sessions
  useEffect(() => {
    if (isSwitchingSession) {
      setWebSearchState({
        isLoading: false,
        workflowId: null,
        results: null,
        error: null
      });
    }
  }, [isSwitchingSession]);

  return useMemo(
    () => ({
      isRefiningTask,
      isWebRefiningTask: webSearchState.isLoading || isGeneratingPrompts,
      taskCopySuccess,
      taskDescriptionRef,
      canUndo,
      canRedo,
      webSearchResults: webSearchState.results,

      // Actions
      handleRefineTask,
      handleWebRefineTask,
      cancelWebSearch,
      copyTaskDescription,
      reset,
      undo,
      redo,
      recordTaskChange,
      saveToHistory,
      applyWebSearchResults,
    }),
    [
      isRefiningTask,
      webSearchState.isLoading,
      webSearchState.results,
      taskCopySuccess,
      taskDescriptionRef,
      canUndo,
      canRedo,
      handleRefineTask,
      handleWebRefineTask,
      cancelWebSearch,
      copyTaskDescription,
      reset,
      undo,
      redo,
      recordTaskChange,
      saveToHistory,
      applyWebSearchResults,
    ]
  );
}