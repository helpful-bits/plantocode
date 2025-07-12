/**
 * React hook for workflow tracking and management
 * Provides a complete React interface for File Finder Workflows
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { WorkflowTracker, WorkflowUtils } from '@/utils/workflow-utils';
import { WORKFLOW_STATUSES } from '@/types/workflow-types';
import { useWorkflowPerformanceMonitor } from '@/utils/workflow-performance-monitor';
import { createWorkflowError } from '@/utils/error-handling';
import type {
  WorkflowState,
  WorkflowResultsResponse,
  WorkflowConfiguration,
} from '@/types/workflow-types';

export interface UseWorkflowTrackerOptions {
  autoStart?: boolean;
  onComplete?: (results: WorkflowResultsResponse) => void;
  onError?: (error: Error) => void;
  onProgress?: (state: WorkflowState) => void;
}

export interface UseWorkflowTrackerReturn {
  // State
  workflowState: WorkflowState | null;
  isRunning: boolean;
  isCompleted: boolean;
  hasError: boolean;
  error: Error | null;
  results: WorkflowResultsResponse | null;
  
  // Computed state
  progressPercentage: number;
  currentStageName: string;
  currentStageDescription: string;
  executionTime: string;
  
  // Actions
  startWorkflow: () => Promise<void>;
  cancelWorkflow: () => Promise<void>;
  retryWorkflow: () => Promise<void>;
  getResults: () => Promise<WorkflowResultsResponse | null>;
  clearError: () => void;
  
  // Advanced
  workflowTracker: WorkflowTracker | null;
}

/**
 * Base hook that provides common workflow tracking functionality
 */
function useBaseWorkflowTracker(
  options: Omit<UseWorkflowTrackerOptions, 'autoStart'> = {}
) {
  // Core state
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [results, setResults] = useState<WorkflowResultsResponse | null>(null);
  
  // Internal refs
  const trackerRef = useRef<WorkflowTracker | null>(null);
  const eventCleanupRef = useRef<(() => void) | null>(null);
  const terminalStateReachedRef = useRef(false);
  
  // Performance monitoring
  const performanceMonitor = useWorkflowPerformanceMonitor();
  
  // Computed state
  const isRunning = workflowState?.status === WORKFLOW_STATUSES.RUNNING || workflowState?.status === WORKFLOW_STATUSES.CREATED;
  const isCompleted = workflowState?.status === WORKFLOW_STATUSES.COMPLETED;
  const hasError = error !== null || workflowState?.status === WORKFLOW_STATUSES.FAILED;
  const progressPercentage = workflowState?.progressPercentage ?? 0;
  const currentStageName = workflowState?.currentStage 
    ? WorkflowUtils.getStageName(workflowState.currentStage)
    : '';
  const currentStageDescription = workflowState?.currentStage
    ? WorkflowUtils.getStageDescription(workflowState.currentStage)
    : '';
  const executionTime = WorkflowUtils.formatExecutionTime(workflowState?.totalExecutionTimeMs);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (trackerRef.current) {
      trackerRef.current.destroy();
      trackerRef.current = null;
    }
    if (eventCleanupRef.current) {
      eventCleanupRef.current();
      eventCleanupRef.current = null;
    }
    terminalStateReachedRef.current = false;
  }, []);

  // Setup event handlers for a tracker
  const setupEventHandlers = useCallback((tracker: WorkflowTracker) => {
    tracker.onProgress((state) => {
      // Check if we've already reached a terminal state and this is not a terminal state update
      if (terminalStateReachedRef.current && 
          !WORKFLOW_STATUSES.TERMINAL.includes(state.status)) {
        return;
      }
      
      // Update terminal state flag if we've reached a terminal state
      if (WORKFLOW_STATUSES.TERMINAL.includes(state.status)) {
        terminalStateReachedRef.current = true;
      }
      
      setWorkflowState(state);
      performanceMonitor.updateFromState(state);
      options.onProgress?.(state);
    });

    tracker.onComplete((workflowResults) => {
      setResults(workflowResults);
      options.onComplete?.(workflowResults);
    });

    tracker.onError((workflowError) => {
      setError(workflowError);
      options.onError?.(workflowError);
    });
  }, [performanceMonitor, options]);

  // Cancel workflow
  const cancelWorkflow = useCallback(async () => {
    if (!trackerRef.current) return;

    try {
      await trackerRef.current.cancel();
    } catch (err) {
      const error = err instanceof Error 
        ? createWorkflowError('Failed to cancel workflow', { 
            workflowId: trackerRef.current?.getWorkflowId() || 'unknown',
            stageName: 'workflow_cancel'
          }, { cause: err })
        : createWorkflowError('Failed to cancel workflow', { 
            workflowId: trackerRef.current?.getWorkflowId() || 'unknown'
          });
      setError(error);
      options.onError?.(error);
    }
  }, [options]);

  // Get workflow results
  const getResults = useCallback(async (): Promise<WorkflowResultsResponse | null> => {
    if (!trackerRef.current) return null;

    try {
      return await trackerRef.current.getResults();
    } catch (err) {
      const error = err instanceof Error 
        ? createWorkflowError('Failed to get workflow results', { 
            workflowId: trackerRef.current?.getWorkflowId() || 'unknown',
            stageName: 'results_fetch'
          }, { cause: err })
        : createWorkflowError('Failed to get workflow results', { 
            workflowId: trackerRef.current?.getWorkflowId() || 'unknown'
          });
      setError(error);
      options.onError?.(error);
      return null;
    }
  }, [options]);

  // Clear error state
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    // State
    workflowState,
    error,
    results,
    setWorkflowState,
    setError,
    setResults,
    
    // Refs
    trackerRef,
    terminalStateReachedRef,
    
    // Computed state
    isRunning,
    isCompleted,
    hasError,
    progressPercentage,
    currentStageName,
    currentStageDescription,
    executionTime,
    
    // Actions
    cancelWorkflow,
    getResults,
    clearError,
    cleanup,
    setupEventHandlers,
    
    // Utils
    performanceMonitor,
  };
}

export function useWorkflowTracker(
  sessionId: string,
  taskDescription: string,
  projectDirectory: string,
  excludedPaths: string[] = [],
  options: UseWorkflowTrackerOptions = {}
): UseWorkflowTrackerReturn {
  // Use base hook
  const base = useBaseWorkflowTracker(options);
  
  // Internal refs
  const isInitializedRef = useRef(false);
  
  // Configuration
  const config: WorkflowConfiguration = {
    timeoutMs: 300000, // 5 minutes default
  };

  // Start workflow
  const startWorkflow = useCallback(async () => {
    try {
      // Clean up any existing tracker
      base.cleanup();
      
      // Clear previous state
      base.setError(null);
      base.setResults(null);
      base.setWorkflowState(null);
      base.terminalStateReachedRef.current = false;

      // Start new workflow
      const tracker = await WorkflowTracker.startWorkflow(
        sessionId,
        taskDescription,
        projectDirectory,
        excludedPaths,
        config
      );

      base.trackerRef.current = tracker;

      // Set up event handlers
      base.setupEventHandlers(tracker);

      // Get initial status
      const initialState = await tracker.getStatus();
      base.setWorkflowState(initialState);
      
      // Initialize performance monitoring for this workflow
      base.performanceMonitor.updateFromState(initialState);

    } catch (err) {
      const error = err instanceof Error 
        ? createWorkflowError('Failed to start workflow', { 
            workflowId: sessionId, // Use sessionId as temp identifier
            stageName: 'workflow_start'
          }, { cause: err })
        : createWorkflowError('Failed to start workflow', { 
            workflowId: sessionId 
          });
      base.setError(error);
      options.onError?.(error);
    }
  }, [sessionId, taskDescription, projectDirectory, excludedPaths, options, base]);

  // Retry workflow (restart with same parameters)
  const retryWorkflow = useCallback(async () => {
    await startWorkflow();
  }, [startWorkflow]);

  // Auto-start effect
  useEffect(() => {
    if (options.autoStart && !isInitializedRef.current && sessionId && taskDescription && projectDirectory) {
      isInitializedRef.current = true;
      startWorkflow();
    }
  }, [options.autoStart, sessionId, taskDescription, projectDirectory, startWorkflow]);

  // Reset initialized flag when key dependencies change
  useEffect(() => {
    isInitializedRef.current = false;
  }, [sessionId, taskDescription, projectDirectory]);

  return {
    // State
    workflowState: base.workflowState,
    isRunning: base.isRunning,
    isCompleted: base.isCompleted,
    hasError: base.hasError,
    error: base.error,
    results: base.results,
    
    // Computed state
    progressPercentage: base.progressPercentage,
    currentStageName: base.currentStageName,
    currentStageDescription: base.currentStageDescription,
    executionTime: base.executionTime,
    
    // Actions
    startWorkflow,
    cancelWorkflow: base.cancelWorkflow,
    retryWorkflow,
    getResults: base.getResults,
    clearError: base.clearError,
    
    // Advanced
    workflowTracker: base.trackerRef.current,
  };
}

/**
 * Hook for reconnecting to an existing workflow
 */
export function useExistingWorkflowTracker(
  workflowId: string,
  sessionId: string,
  options: Omit<UseWorkflowTrackerOptions, 'autoStart'> = {}
): Omit<UseWorkflowTrackerReturn, 'startWorkflow' | 'retryWorkflow'> & { refreshState?: () => Promise<void> } {
  // Use base hook
  const base = useBaseWorkflowTracker(options);

  // Manual refresh function
  const refreshState = useCallback(async () => {
    if (!base.trackerRef.current) return;
    
    try {
      // Use the WorkflowTracker's refreshState method which calls getStatus and notifies progress callbacks
      await base.trackerRef.current.refreshState();
      
      // Get the current state for local state updates
      const currentState = await base.trackerRef.current.getStatus();
      base.setWorkflowState(currentState);
      base.performanceMonitor.updateFromState(currentState);
      
      // If completed and we don't have results yet, fetch them
      if (currentState.status === WORKFLOW_STATUSES.COMPLETED && !base.results) {
        try {
          const workflowResults = await base.trackerRef.current.getResults();
          base.setResults(workflowResults);
        } catch (resultsError) {
          console.warn('Could not fetch results during manual refresh:', resultsError);
        }
      }
    } catch (error) {
      console.error('Error during manual refresh:', error);
      // Don't set error state here as it might disrupt the UI unnecessarily
    }
  }, [base]);

  // Connect to existing workflow
  useEffect(() => {
    if (!workflowId || !sessionId) return;

    const connectToWorkflow = async () => {
      try {
        base.cleanup();
        
        // Import createWorkflowTracker function
        const { createWorkflowTracker } = await import('@/utils/workflow-utils');
        const tracker = await createWorkflowTracker(workflowId, sessionId);

        base.trackerRef.current = tracker;

        // Set up event handlers
        base.setupEventHandlers(tracker);

        // Get initial status
        const initialState = await tracker.getStatus();
        base.setWorkflowState(initialState);
        
        // Initialize performance monitoring for this workflow
        base.performanceMonitor.updateFromState(initialState);

        // If already completed, get results
        if (initialState.status === WORKFLOW_STATUSES.COMPLETED) {
          try {
            const workflowResults = await tracker.getResults();
            base.setResults(workflowResults);
          } catch (resultsError) {
            console.warn('Could not fetch results for completed workflow:', resultsError);
          }
        }

      } catch (err) {
        const error = err instanceof Error 
          ? createWorkflowError('Failed to connect to workflow', { 
              workflowId,
              stageName: 'workflow_connect'
            }, { cause: err })
          : createWorkflowError('Failed to connect to workflow', { 
              workflowId
            });
        base.setError(error);
        options.onError?.(error);
      }
    };

    connectToWorkflow();
  }, [workflowId, sessionId, options, base]);

  return {
    // State
    workflowState: base.workflowState,
    isRunning: base.isRunning,
    isCompleted: base.isCompleted,
    hasError: base.hasError,
    error: base.error,
    results: base.results,
    
    // Computed state
    progressPercentage: base.progressPercentage,
    currentStageName: base.currentStageName,
    currentStageDescription: base.currentStageDescription,
    executionTime: base.executionTime,
    
    // Actions
    cancelWorkflow: base.cancelWorkflow,
    getResults: base.getResults,
    clearError: base.clearError,
    refreshState,
    
    // Advanced
    workflowTracker: base.trackerRef.current,
  };
}

/**
 * Hook for monitoring multiple workflows
 */
export function useMultipleWorkflowTracker(
  workflows: Array<{ workflowId: string; sessionId: string }>
): {
  workflowStates: Record<string, WorkflowState | null>;
  errors: Record<string, Error | null>;
  results: Record<string, WorkflowResultsResponse | null>;
  overallProgress: number;
  anyRunning: boolean;
  allCompleted: boolean;
  cancelAll: () => Promise<void>;
  clearAllErrors: () => void;
} {
  const [workflowStates, setWorkflowStates] = useState<Record<string, WorkflowState | null>>({});
  const [errors, setErrors] = useState<Record<string, Error | null>>({});
  const [results, setResults] = useState<Record<string, WorkflowResultsResponse | null>>({});
  
  const trackersRef = useRef<Record<string, WorkflowTracker>>({});
  
  // Performance monitoring
  const performanceMonitor = useWorkflowPerformanceMonitor();

  // Computed state
  const overallProgress = Object.values(workflowStates).reduce((sum, state) => {
    return sum + (state?.progressPercentage ?? 0);
  }, 0) / Math.max(workflows.length, 1);

  const anyRunning = Object.values(workflowStates).some(state => 
    state?.status === WORKFLOW_STATUSES.RUNNING || state?.status === WORKFLOW_STATUSES.CREATED
  );

  const allCompleted = workflows.length > 0 && Object.values(workflowStates).every(state => 
    state?.status === WORKFLOW_STATUSES.COMPLETED
  );

  // Cancel all workflows
  const cancelAll = useCallback(async () => {
    const promises = Object.values(trackersRef.current).map(tracker => 
      tracker.cancel().catch(console.error)
    );
    await Promise.all(promises);
  }, []);

  // Clear all errors
  const clearAllErrors = useCallback(() => {
    setErrors({});
  }, []);

  // Set up trackers for each workflow
  useEffect(() => {
    const setupTrackers = async () => {
      // Clean up existing trackers
      Object.values(trackersRef.current).forEach(tracker => tracker.destroy());
      trackersRef.current = {};

      for (const { workflowId, sessionId } of workflows) {
        try {
          const { createWorkflowTracker } = await import('@/utils/workflow-utils');
          const tracker = await createWorkflowTracker(workflowId, sessionId);

          trackersRef.current[workflowId] = tracker;

          tracker.onProgress((state) => {
            setWorkflowStates(prev => ({ ...prev, [workflowId]: state }));
            // Update performance monitor for this workflow
            performanceMonitor.updateFromState(state);
          });

          tracker.onComplete((workflowResults) => {
            setResults(prev => ({ ...prev, [workflowId]: workflowResults }));
          });

          tracker.onError((error) => {
            setErrors(prev => ({ ...prev, [workflowId]: error }));
          });

          // Get initial state
          const initialState = await tracker.getStatus();
          setWorkflowStates(prev => ({ ...prev, [workflowId]: initialState }));
          
          // Initialize performance monitoring for this workflow
          performanceMonitor.updateFromState(initialState);

        } catch (error) {
          setErrors(prev => ({ 
            ...prev, 
            [workflowId]: error instanceof Error ? error : new Error('Failed to connect to workflow')
          }));
        }
      }
    };

    if (workflows.length > 0) {
      setupTrackers();
    }

    return () => {
      Object.values(trackersRef.current).forEach(tracker => tracker.destroy());
      trackersRef.current = {};
    };
  }, [workflows]);

  return {
    workflowStates,
    errors,
    results,
    overallProgress,
    anyRunning,
    allCompleted,
    cancelAll,
    clearAllErrors,
  };
}