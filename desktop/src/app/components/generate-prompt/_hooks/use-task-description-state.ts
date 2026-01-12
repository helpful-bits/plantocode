"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

import { refineTaskDescriptionAction } from "@/actions/ai/task-refinement.actions";
import { startWebSearchWorkflowOrchestratorAction, cancelWorkflowAction } from "@/actions/workflows/workflow.actions";
import { startWebSearchPromptsGenerationJobAction } from '@/actions/ai/web-search-workflow.actions';
import {
  getHistoryStateAction,
  syncHistoryStateAction,
  mergeHistoryStateAction,
  getDeviceIdAction,
  type HistoryState,
  type HistoryEntry,
} from '@/actions/session/history.actions';
import { mergeThreeWayWithCursor } from '@/utils/text-merge';
// listen import removed - legacy 'session-history-synced' listener was removed
import { useBackgroundJob } from "@/contexts/_hooks/use-background-job";
import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import { useSessionActionsContext, useSessionStateContext } from "@/contexts/session";
import { extractErrorInfo, createUserFriendlyErrorMessage } from "@/utils/error-handling";

// Import TaskDescriptionHandle type directly
import type { TaskDescriptionHandle } from "../_components/task-description";

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function(this: any, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const TASK_HISTORY_MAX_ENTRIES = 200;

const nextSequenceNumber = (entries: HistoryEntry[], deviceId?: string): number => {
  const targetId = deviceId?.toLowerCase();
  let max = -1;
  for (const entry of entries) {
    if (targetId && entry.deviceId?.toLowerCase() !== targetId) {
      continue;
    }
    if (typeof entry.sequenceNumber === "number" && entry.sequenceNumber > max) {
      max = entry.sequenceNumber;
    }
  }
  return max + 1;
};


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

  // New HistoryState management
  const [historyState, setHistoryState] = useState<HistoryState>({
    entries: [],
    currentIndex: 0,
    version: 1,
    checksum: '',
  });
  const [deviceId, setDeviceId] = useState<string>('');
  const [value, setValue] = useState(sessionTaskDescription || '');
  const valueRef = useRef(value);
  const isNavigatingHistoryRef = useRef(false);
  const isUndoRedoInProgress = useRef(false);
  const remoteHistoryApplyingRef = useRef(false);
  const lastCommittedValueRef = useRef('');
  const lastSyncedVersionRef = useRef(0);
  const pendingRemoteStateRef = useRef<HistoryState | null>(null);
  const [showMergePulse, setShowMergePulse] = useState(false);
  const lastAppliedRemoteRef = useRef<{ version: number; checksum: string } | null>(null);
  const historyChangeDebounceRef = useRef<number | null>(null);

  // STEP 5: Add historyLoadStatus lifecycle
  const [historyLoadStatus, setHistoryLoadStatus] = useState<'idle'|'loading'|'ready'|'error'>('idle');
  const historyReady = historyLoadStatus === 'ready';
  const loadIdRef = useRef(0);

  // Sync state
  const lastRecordedHashRef = useRef<string>('');

  // Update valueRef when value changes
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Load device ID on mount
  useEffect(() => {
    getDeviceIdAction().then(setDeviceId);
  }, []);

  // STEP 5: Derived canUndo/canRedo using useMemo
  const canUndo = useMemo(() => {
    if (!historyReady) return false;
    return historyState.currentIndex > 0;
  }, [historyReady, historyState.currentIndex]);

  const canRedo = useMemo(() => {
    if (!historyReady) return false;
    return historyState.currentIndex < historyState.entries.length - 1;
  }, [historyReady, historyState.currentIndex, historyState.entries.length]);

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


  const recordTaskChange = useCallback(async (source: 'typing' | 'paste' | 'voice' | 'improvement' | 'refine' | 'remote', value: string) => {
    if (!historyReady) return; // Guard before ready
    if (isNavigatingHistoryRef.current) return; // Guard undo/redo echoes
    if (!activeSessionId) return;

    const normalized = value ?? '';
    const last = historyState.entries[historyState.currentIndex];

    // Dedupe: skip if same as current entry
    if (last && normalized === last.value) return;

    // Compute hash for additional deduplication
    const hash = `${source}:${normalized}`;
    if (hash === lastRecordedHashRef.current) return;
    lastRecordedHashRef.current = hash;

    // Create new entry
    const newEntry: HistoryEntry = {
      value: normalized,
      timestampMs: Date.now(),
      deviceId: deviceId || 'unknown',
      opType: source,
      sequenceNumber: nextSequenceNumber(historyState.entries, deviceId || undefined),
      version: historyState.version,
    };

    // Create new state with entry appended and index incremented
    const newEntries = historyState.entries.slice(0, historyState.currentIndex + 1);
    newEntries.push(newEntry);

    const trimmedEntries = newEntries.slice(-TASK_HISTORY_MAX_ENTRIES);

    const newState: HistoryState = {
      entries: trimmedEntries,
      currentIndex: trimmedEntries.length - 1,
      version: historyState.version,
      checksum: historyState.checksum,
    };

    // Update local state immediately for responsiveness
    setHistoryState(newState);
    setValue(normalized);

    // Sync to backend
    try {
      const updatedState = await syncHistoryStateAction(activeSessionId, 'task', newState, historyState.version);
      if (updatedState.version >= lastSyncedVersionRef.current) {
        const syncedEntry = updatedState.entries[updatedState.currentIndex];
        const syncedValue = syncedEntry?.value ?? normalized;

        lastSyncedVersionRef.current = updatedState.version;
        lastCommittedValueRef.current = syncedValue;
        setHistoryState(updatedState);

        if (valueRef.current === normalized && syncedValue !== normalized) {
          setValue(syncedValue);
          valueRef.current = syncedValue;
          taskDescriptionRef.current?.setValueFromHistory?.(syncedValue);
          sessionActions.updateCurrentSessionFields({ taskDescription: syncedValue });
        }
      }
    } catch (err) {
      console.error('[recordTaskChange] Failed to sync:', err);
      // Keep local state even if sync fails
    }
  }, [historyReady, historyState, deviceId, activeSessionId, sessionActions, taskDescriptionRef]);

  // Task refinement job monitoring with conflict detection
  useEffect(() => {
    if (isSwitchingSession || !taskRefinementJobId || !taskRefinementJob.job) return;

    const job = taskRefinementJob.job;
    if (!job?.status) return;

    const handleJobCompletion = async () => {
      if (job.status === "completed" && job.response && job.sessionId === activeSessionId) {
        const refinedTask = String(job.response).trim();
        if (refinedTask) {
          let finalTaskDescription = refinedTask;
          try {
            const parsed = JSON.parse(refinedTask);
            if (parsed.original && parsed.refined) {
              finalTaskDescription = parsed.original + "\n\n" + parsed.refined;
            }
          } catch {
          }

          const hasConflict = refinementOriginalTask !== null && refinementOriginalTask !== sessionTaskDescription;

          if (hasConflict) {
            const textareaRef = taskDescriptionRef.current;
            let newValue: string;

            if (textareaRef && typeof (textareaRef as any).getSelectionRange === 'function' && typeof (textareaRef as any).replaceSelection === 'function') {
              (textareaRef as any).replaceSelection(finalTaskDescription);
              newValue = (textareaRef as any).getValue?.() || sessionTaskDescription;
            } else {
              newValue = sessionTaskDescription + "\n" + finalTaskDescription;
              if (textareaRef?.setValueFromHistory) {
                textareaRef.setValueFromHistory(newValue);
              }
            }

            recordTaskChange('refine', newValue);
            sessionActions.updateCurrentSessionFields({ taskDescription: newValue });
            onInteraction?.();
            showNotification({
              title: "Task refined",
              message: "Refined content inserted at cursor due to concurrent edits.",
              type: "success"
            });
          } else {
            if (taskDescriptionRef.current?.setValueFromHistory) {
              taskDescriptionRef.current.setValueFromHistory(finalTaskDescription);
            }
            recordTaskChange('refine', finalTaskDescription);
            sessionActions.updateCurrentSessionFields({ taskDescription: finalTaskDescription });
            onInteraction?.();
            showNotification({ title: "Task refined", message: "Task description has been refined.", type: "success" });
          }
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
  }, [taskRefinementJob.job?.status, taskRefinementJobId, isSwitchingSession, activeSessionId, onInteraction, showNotification, sessionTaskDescription, sessionActions, refinementOriginalTask, recordTaskChange, taskDescriptionRef]);

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
          // Ignore errors
        }
      }, 2000);
      
      // Store timeout ID for potential cleanup (though not critical for short timeouts)
      return true;
    } catch (error) {
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
      setIsRefiningTask(false);

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
      // Ignore cancellation errors
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



  // STEP 5: Session change effect with lifecycle status
  useEffect(() => {
    if (!activeSessionId) {
      // Batch both updates together
      setHistoryLoadStatus('idle');
      setHistoryState({
        entries: [],
        currentIndex: 0,
        version: 1,
        checksum: '',
      });
      lastAppliedRemoteRef.current = null;
      lastRecordedHashRef.current = '';
      lastCommittedValueRef.current = '';
      lastSyncedVersionRef.current = 0;
      return;
    }

    // Increment loadId for race protection
    const currentLoadId = ++loadIdRef.current;
    setHistoryLoadStatus('loading');

    // Clear pending state refs
    pendingRemoteStateRef.current = null;
    remoteHistoryApplyingRef.current = false;
    isNavigatingHistoryRef.current = false;
    lastAppliedRemoteRef.current = null;
    lastRecordedHashRef.current = '';
    lastCommittedValueRef.current = '';
    lastSyncedVersionRef.current = 0;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const loadHistory = async () => {
      try {
        const state = await getHistoryStateAction(activeSessionId, 'task');

        // Check for stale load
        if (currentLoadId !== loadIdRef.current) {
          return;
        }

        if (controller.signal.aborted) {
          return;
        }

        // Validate and clamp
        if (state && state.entries && state.entries.length > 0) {
          // CLIENT-SIDE DEFENSIVE FILTERING: Remove invalid entries
          let entries = Array.isArray(state.entries)
            ? state.entries.filter(e => e?.value != null)
            : [];

          const len = entries.length;
          const idx = state.currentIndex;
          const clampedIndex = Math.min(Math.max(idx, 0), Math.max(len - 1, 0));

          const validatedState = {
            ...state,
            entries,
            currentIndex: clampedIndex,
          };

          setHistoryState(validatedState);

          // Update editor value
          const currentEntry = validatedState.entries[validatedState.currentIndex];
          if (currentEntry) {
            setValue(currentEntry.value);
            lastCommittedValueRef.current = currentEntry.value;
          }
          lastSyncedVersionRef.current = validatedState.version;

          setHistoryLoadStatus('ready');
        } else {
          // Empty state - will be initialized by next effect
          setHistoryState({
            entries: [],
            currentIndex: 0,
            version: 1,
            checksum: '',
          });
          lastSyncedVersionRef.current = 1;
          setHistoryLoadStatus('ready');
        }
      } catch (error) {
        if (currentLoadId !== loadIdRef.current) return;

        setHistoryLoadStatus('error');
      } finally {
        clearTimeout(timeoutId);
      }
    };

    loadHistory();

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [activeSessionId]);

  // STEP 5: Initialize empty history from sessionTaskDescription (only after ready)
  useEffect(() => {
    if (!historyReady) return;
    if (historyState.entries.length === 0 && activeSessionId && deviceId) {
      const initial = sessionTaskDescription || '';
      const initEntry: HistoryEntry = {
        value: initial,
        timestampMs: Date.now(),
        deviceId: deviceId,
        opType: 'init',
        sequenceNumber: 0,
        version: 1,
      };

      const newState: HistoryState = {
        entries: [initEntry],
        currentIndex: 0,
        version: 1,
        checksum: '', // Will be computed by backend
      };

      setHistoryState(newState);
      setValue(initial);
      valueRef.current = initial;
      lastCommittedValueRef.current = initial;
      lastSyncedVersionRef.current = newState.version;

      // Immediately sync the initial entry to persist it
      syncHistoryStateAction(activeSessionId, 'task', newState, 1)
        .then(updatedState => {
          if (updatedState.version >= lastSyncedVersionRef.current) {
            const syncedEntry = updatedState.entries[updatedState.currentIndex];
            const syncedValue = syncedEntry?.value ?? initial;
            lastSyncedVersionRef.current = updatedState.version;
            lastCommittedValueRef.current = syncedValue;
            setHistoryState(updatedState);
            if (valueRef.current === initial && syncedValue !== initial) {
              setValue(syncedValue);
              valueRef.current = syncedValue;
              taskDescriptionRef.current?.setValueFromHistory?.(syncedValue);
              sessionActions.updateCurrentSessionFields({ taskDescription: syncedValue });
            }
          }
        })
        .catch(err => {
          console.error('[HistoryInit] Failed to sync initial entry:', err);
          // Keep the local state even if sync fails
        });
    }
  }, [historyReady, deviceId, sessionTaskDescription, activeSessionId, sessionActions, taskDescriptionRef]);

  // Debounced commit with new entry creation (1000ms)
  const commitNewEntry = useCallback(
    debounce(async (value: string) => {
      if (!historyReady) return; // Guard before ready
      if (!activeSessionId || !deviceId) return;
      if (isNavigatingHistoryRef.current || remoteHistoryApplyingRef.current) return;

      const newEntry: HistoryEntry = {
        value: value,
        timestampMs: Date.now(),
        deviceId,
        opType: 'user-edit',
        sequenceNumber: nextSequenceNumber(historyState.entries, deviceId || undefined),
        version: historyState.version,
      };

      const trimmedEntries = historyState.entries.slice(0, historyState.currentIndex + 1);
      const newEntries = [...trimmedEntries, newEntry].slice(-TASK_HISTORY_MAX_ENTRIES);

      const newState: HistoryState = {
        entries: newEntries,
        currentIndex: newEntries.length - 1,
        version: historyState.version,
        checksum: '',
      };

      try {
        const updated = await syncHistoryStateAction(
          activeSessionId,
          'task',
          newState,
          historyState.version
        );
        if (updated.version >= lastSyncedVersionRef.current) {
          const syncedEntry = updated.entries[updated.currentIndex];
          const syncedValue = syncedEntry?.value ?? value;
          lastSyncedVersionRef.current = updated.version;
          lastCommittedValueRef.current = syncedValue;
          setHistoryState(updated);
        }
      } catch (err) {
        // Ignore commit errors
      }
    }, 1000),
    [historyReady, activeSessionId, deviceId, historyState]
  );

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

  // Listen for "history-state-changed" events
  useEffect(() => {
    if (!activeSessionId || !deviceId) return;

    const handleHistoryStateChanged = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { sessionId: eventSessionId, kind, state, relayOrigin } = customEvent.detail;

      if (eventSessionId !== activeSessionId || kind !== 'task') return;

      const remoteVersion = state.version;
      const remoteChecksum = state.checksum;

      if (lastAppliedRemoteRef.current) {
        if (remoteVersion < lastAppliedRemoteRef.current.version) return;
        if (remoteVersion === lastAppliedRemoteRef.current.version && remoteChecksum === lastAppliedRemoteRef.current.checksum) return;
      }

      if (relayOrigin === 'local') {
        lastAppliedRemoteRef.current = { version: remoteVersion, checksum: remoteChecksum };
        if (remoteVersion >= lastSyncedVersionRef.current) {
          lastSyncedVersionRef.current = remoteVersion;
        }
        return;
      }

      const remoteEntry = state.entries[state.currentIndex];
      if (!remoteEntry) return;
      const remoteValue = remoteEntry.value;

      const localValue = valueRef.current;
      const baseValue = lastCommittedValueRef.current;
      const hasLocalEdits = localValue !== baseValue;

      if (hasLocalEdits) {
        if (historyChangeDebounceRef.current !== null) {
          clearTimeout(historyChangeDebounceRef.current);
          historyChangeDebounceRef.current = null;
        }

        const textarea = taskDescriptionRef.current;
        const cursorPos = textarea?.selectionStart ?? localValue.length;

        const { merged, newCursor } = mergeThreeWayWithCursor(baseValue, localValue, remoteValue, cursorPos);

        setValue(merged);
        valueRef.current = merged;

        if (textarea) {
          if (textarea.setValueFromHistory) {
            textarea.setValueFromHistory(merged);
          }
          setTimeout(() => {
            if (textarea.setSelectionRange) {
              textarea.setSelectionRange(newCursor, newCursor);
              return;
            }
            const el = document.getElementById('taskDescArea') as HTMLTextAreaElement | null;
            if (el) {
              el.setSelectionRange(newCursor, newCursor);
            }
          }, 0);
        }

        sessionActions.updateCurrentSessionFields({ taskDescription: merged });

        try {
          const mergedState = await mergeHistoryStateAction(activeSessionId, 'task', state);
          setHistoryState(mergedState);
          lastCommittedValueRef.current = merged;
          if (mergedState.version >= lastSyncedVersionRef.current) {
            lastSyncedVersionRef.current = mergedState.version;
          }
        } catch (err) {
          console.error('[history-state-changed] merge failed:', err);
        }

        setShowMergePulse(true);
        setTimeout(() => setShowMergePulse(false), 500);
      } else {
        setHistoryState(state);
        setValue(remoteValue);
        valueRef.current = remoteValue;
        lastCommittedValueRef.current = remoteValue;
        if (remoteVersion >= lastSyncedVersionRef.current) {
          lastSyncedVersionRef.current = remoteVersion;
        }

        if (taskDescriptionRef.current?.setValueFromHistory) {
          taskDescriptionRef.current.setValueFromHistory(remoteValue);
        }
        sessionActions.updateCurrentSessionFields({ taskDescription: remoteValue });

        setShowMergePulse(true);
        setTimeout(() => setShowMergePulse(false), 300);
      }

      lastAppliedRemoteRef.current = { version: remoteVersion, checksum: remoteChecksum };
    };

    window.addEventListener('history-state-changed', handleHistoryStateChanged);

    return () => {
      window.removeEventListener('history-state-changed', handleHistoryStateChanged);
    };
  }, [activeSessionId, deviceId, taskDescriptionRef, sessionActions]);

  // Refresh task history on relay replay gaps
  useEffect(() => {
    if (!activeSessionId) return;

    let cancelled = false;

    const handleReplayGap = () => {
      (async () => {
        try {
          const state = await getHistoryStateAction(activeSessionId, 'task');
          if (cancelled) return;

          window.dispatchEvent(
            new CustomEvent('history-state-changed', {
              detail: {
                sessionId: activeSessionId,
                kind: 'task',
                state,
                version: state.version,
                checksum: state.checksum,
                relayOrigin: 'remote',
              },
            })
          );
        } catch (err) {
          console.warn('Failed to refresh task history after replay gap', err);
        }
      })();
    };

    window.addEventListener('relay-replay-gap', handleReplayGap);

    return () => {
      cancelled = true;
      window.removeEventListener('relay-replay-gap', handleReplayGap);
    };
  }, [activeSessionId]);

  // Apply pending remote updates at debounce boundary
  useEffect(() => {
    if (pendingRemoteStateRef.current && !isNavigatingHistoryRef.current) {
      const pending = pendingRemoteStateRef.current;
      pendingRemoteStateRef.current = null;

      remoteHistoryApplyingRef.current = true;

      try {
        const currentValue = valueRef.current;
        const remoteValue = pending.entries[pending.currentIndex]?.value || '';
        const baseValue = lastCommittedValueRef.current;

        // STEP 5: Guard against destructive empty overwrites
        const incoming = remoteValue ?? "";
        const local = currentValue ?? "";

        // Skip destructive empty overwrites - do not apply empty remote updates when local is non-empty
        if (incoming.trim() === "" && local.trim() !== "") {
          remoteHistoryApplyingRef.current = false;
          return; // Do not apply
        }

        let mergedValue = currentValue;
        if (currentValue === baseValue) {
          mergedValue = remoteValue;
        } else if (remoteValue !== baseValue) {
          mergedValue = currentValue;
        }

        setHistoryState(pending);
        setValue(mergedValue);
        lastCommittedValueRef.current = mergedValue;
        if (pending.version >= lastSyncedVersionRef.current) {
          lastSyncedVersionRef.current = pending.version;
        }

        // Update legacy components using silent setter to prevent double-queueing
        if (taskDescriptionRef.current?.setValueFromHistory) {
          taskDescriptionRef.current.setValueFromHistory(mergedValue);
        }
        sessionActions.updateCurrentSessionFields({ taskDescription: mergedValue });

        setShowMergePulse(true);
        setTimeout(() => setShowMergePulse(false), 300);
      } finally {
        remoteHistoryApplyingRef.current = false;
      }
    }
  }, [historyState.version, taskDescriptionRef, sessionActions]);

  // New undo function - update currentIndex only, no new entry
  const handleUndo = useCallback(async () => {
    if (!canUndo || !activeSessionId) return;

    isNavigatingHistoryRef.current = true;
    isUndoRedoInProgress.current = true;

    try {
      const newIndex = historyState.currentIndex - 1;
      const entry = historyState.entries[newIndex];

      if (entry) {
        // Create new state with decremented index
        const newState: HistoryState = {
          ...historyState,
          currentIndex: newIndex,
        };

        // Update local state immediately
        setHistoryState(newState);
        setValue(entry.value);

        // Update legacy components using silent setter to prevent echo
        if (taskDescriptionRef.current?.setValueFromHistory) {
          taskDescriptionRef.current.setValueFromHistory(entry.value);
        }
        sessionActions.updateCurrentSessionFields({ taskDescription: entry.value });
        onInteraction?.();

        // Sync to backend
        try {
          const updatedState = await syncHistoryStateAction(activeSessionId, 'task', newState, historyState.version);
          if (updatedState.version >= lastSyncedVersionRef.current) {
            const syncedEntry = updatedState.entries[updatedState.currentIndex];
            const syncedValue = syncedEntry?.value ?? entry.value;
            lastSyncedVersionRef.current = updatedState.version;
            lastCommittedValueRef.current = syncedValue;
            setHistoryState(updatedState);

            if (valueRef.current === entry.value && syncedValue !== entry.value) {
              setValue(syncedValue);
              valueRef.current = syncedValue;
              taskDescriptionRef.current?.setValueFromHistory?.(syncedValue);
              sessionActions.updateCurrentSessionFields({ taskDescription: syncedValue });
            }
          }
        } catch (err) {
          console.error('[handleUndo] Failed to sync:', err);
          // Keep local state even if sync fails
        }
      }
    } catch (err) {
      console.error('[handleUndo] Error:', err);
    } finally {
      isNavigatingHistoryRef.current = false;
      isUndoRedoInProgress.current = false;
    }
  }, [canUndo, activeSessionId, historyState, taskDescriptionRef, sessionActions, onInteraction]);

  // New redo function - update currentIndex only, no new entry
  const handleRedo = useCallback(async () => {
    if (!canRedo || !activeSessionId) return;

    isNavigatingHistoryRef.current = true;
    isUndoRedoInProgress.current = true;

    try {
      const newIndex = historyState.currentIndex + 1;
      const entry = historyState.entries[newIndex];

      if (entry) {
        // Create new state with incremented index
        const newState: HistoryState = {
          ...historyState,
          currentIndex: newIndex,
        };

        // Update local state immediately
        setHistoryState(newState);
        setValue(entry.value);

        // Update legacy components using silent setter to prevent echo
        if (taskDescriptionRef.current?.setValueFromHistory) {
          taskDescriptionRef.current.setValueFromHistory(entry.value);
        }
        sessionActions.updateCurrentSessionFields({ taskDescription: entry.value });
        onInteraction?.();

        // Sync to backend
        try {
          const updatedState = await syncHistoryStateAction(activeSessionId, 'task', newState, historyState.version);
          if (updatedState.version >= lastSyncedVersionRef.current) {
            const syncedEntry = updatedState.entries[updatedState.currentIndex];
            const syncedValue = syncedEntry?.value ?? entry.value;
            lastSyncedVersionRef.current = updatedState.version;
            lastCommittedValueRef.current = syncedValue;
            setHistoryState(updatedState);

            if (valueRef.current === entry.value && syncedValue !== entry.value) {
              setValue(syncedValue);
              valueRef.current = syncedValue;
              taskDescriptionRef.current?.setValueFromHistory?.(syncedValue);
              sessionActions.updateCurrentSessionFields({ taskDescription: syncedValue });
            }
          }
        } catch (err) {
          console.error('[handleRedo] Failed to sync:', err);
          // Keep local state even if sync fails
        }
      }
    } catch (err) {
      console.error('[handleRedo] Error:', err);
    } finally {
      isNavigatingHistoryRef.current = false;
      isUndoRedoInProgress.current = false;
    }
  }, [canRedo, activeSessionId, historyState, taskDescriptionRef, sessionActions, onInteraction]);

  // Undo/redo helpers
  const undo = useCallback(() => {
    handleUndo();
  }, [handleUndo]);

  const redo = useCallback(() => {
    handleRedo();
  }, [handleRedo]);
  
  // Apply web search results to task description
  const applyWebSearchResults = useCallback((resultsToApply?: string[]) => {
    // Use provided results or fallback to state
    const results = resultsToApply || webSearchState.results;
    
    if (!results || results.length === 0) {
      return;
    }

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
    if (taskDescriptionRef.current?.setValueFromHistory) {
      taskDescriptionRef.current.setValueFromHistory(finalTaskDescription);
    }
    // Record the web search results in history
    recordTaskChange('improvement', finalTaskDescription);
    // Update session context immediately to keep it in sync
    sessionActions.updateCurrentSessionFields({ taskDescription: finalTaskDescription });
    onInteraction?.();

    // Clear the web search results after applying
    setWebSearchState(prev => ({ ...prev, results: null }));

    showNotification({
      title: "Research applied",
      message: "Web search findings have been added to your task description.",
      type: "success"
    });
  }, [sessionTaskDescription, taskDescriptionRef, activeSessionId, onInteraction, showNotification, webSearchState.results]);

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
      showMergePulse,
      value,
      setValue,
      historyLoadStatus,
      historyReady,

      // Actions
      handleRefineTask,
      handleWebRefineTask,
      cancelWebSearch,
      copyTaskDescription,
      reset,
      undo,
      redo,
      handleUndo,
      handleRedo,
      recordTaskChange,
      applyWebSearchResults,
      commitNewEntry,
    }),
    [
      isRefiningTask,
      webSearchState.isLoading,
      webSearchState.results,
      isGeneratingPrompts,
      taskCopySuccess,
      taskDescriptionRef,
      canUndo,
      canRedo,
      showMergePulse,
      value,
      historyLoadStatus,
      historyReady,
      handleRefineTask,
      handleWebRefineTask,
      cancelWebSearch,
      copyTaskDescription,
      reset,
      undo,
      redo,
      handleUndo,
      handleRedo,
      recordTaskChange,
      applyWebSearchResults,
      commitNewEntry,
    ]
  );
}
