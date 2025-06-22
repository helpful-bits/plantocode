import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { type WorkflowStatusResponse } from '@/types/workflow-types';

export interface WorkflowManagerState {
  workflows: WorkflowStatusResponse[];
  loading: boolean;
  error: string | null;
}

export interface WorkflowManagerActions {
  refreshWorkflows: () => Promise<void>;
  getWorkflowById: (workflowId: string) => Promise<WorkflowStatusResponse | null>;
  cancelWorkflow: (workflowId: string) => Promise<void>;
  pauseWorkflow: (workflowId: string) => Promise<void>;
  resumeWorkflow: (workflowId: string) => Promise<void>;
  clearError: () => void;
}

export interface UseWorkflowManagerReturn extends WorkflowManagerState {
  actions: WorkflowManagerActions;
}

/**
 * Hook to manage workflow interactions - fetching, refreshing, and controlling workflows
 */
export function useWorkflowManager(): UseWorkflowManagerReturn {
  const [state, setState] = useState<WorkflowManagerState>({
    workflows: [],
    loading: false,
    error: null,
  });

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const setWorkflows = useCallback((workflows: WorkflowStatusResponse[]) => {
    setState(prev => ({ ...prev, workflows }));
  }, []);

  /**
   * Fetch all workflows from the backend
   */
  const refreshWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const workflows = await invoke<WorkflowStatusResponse[]>('get_all_workflows_command', {});
      
      // Validate and clean up the workflows response
      const validWorkflows = (workflows || []).filter(workflow => {
        if (!workflow || !workflow.workflowId) {
          console.warn('Invalid workflow in response:', workflow);
          return false;
        }
        
        // Ensure stageStatuses is properly populated with detailed information
        if (!workflow.stageStatuses) {
          workflow.stageStatuses = [];
        }
        
        // Validate each stage status has required fields with comprehensive mapping
        workflow.stageStatuses = workflow.stageStatuses.map(stage => ({
          ...stage,
          // Ensure all required fields are present with proper defaults
          stageName: stage.stageName || 'UNKNOWN_STAGE',
          status: stage.status || 'idle',
          progressPercentage: stage.progressPercentage || 0,
          jobId: stage.jobId || undefined,
          errorMessage: stage.errorMessage || undefined,
          executionTimeMs: stage.executionTimeMs || undefined,
          startedAt: stage.startedAt || undefined,
          completedAt: stage.completedAt || undefined,
          createdAt: stage.createdAt || undefined,
          dependsOn: stage.dependsOn || undefined,
          subStatusMessage: stage.subStatusMessage || undefined,
        }));
        
        // Ensure overall workflow fields are properly set
        workflow.progressPercentage = workflow.progressPercentage || 0;
        workflow.sessionId = workflow.sessionId || '';
        workflow.taskDescription = workflow.taskDescription || undefined;
        workflow.projectDirectory = workflow.projectDirectory || undefined;
        workflow.createdAt = workflow.createdAt || undefined;
        workflow.updatedAt = workflow.updatedAt || undefined;
        workflow.completedAt = workflow.completedAt || undefined;
        workflow.totalExecutionTimeMs = workflow.totalExecutionTimeMs || undefined;
        workflow.errorMessage = workflow.errorMessage || undefined;
        
        return true;
      });
      
      // Sort workflows by most recent first
      const sortedWorkflows = validWorkflows.sort((a, b) => {
        // Get the most recent stage start time for each workflow
        const getLatestTime = (workflow: WorkflowStatusResponse) => {
          // Try to use workflow-level timestamps first
          if (workflow.updatedAt) return workflow.updatedAt;
          if (workflow.createdAt) return workflow.createdAt;
          
          // Fall back to stage-level timestamps
          const stageTimes = workflow.stageStatuses
            .filter(stage => stage.startedAt || stage.completedAt || stage.createdAt)
            .map(stage => {
              if (stage.completedAt) return new Date(stage.completedAt).getTime();
              if (stage.startedAt) return new Date(stage.startedAt).getTime();
              if (stage.createdAt) return new Date(stage.createdAt).getTime();
              return 0;
            });
          
          return stageTimes.length > 0 ? Math.max(...stageTimes) : 0;
        };
        
        return getLatestTime(b) - getLatestTime(a);
      });

      setWorkflows(sortedWorkflows);
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch workflows');
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, setWorkflows]);

  /**
   * Get detailed information about a specific workflow
   */
  const getWorkflowById = useCallback(async (workflowId: string): Promise<WorkflowStatusResponse | null> => {
    try {
      setError(null);
      
      const workflow = await invoke<WorkflowStatusResponse>('get_workflow_details_command', { workflowId });
      
      // Validate the response structure
      if (!workflow || !workflow.workflowId) {
        console.warn(`Invalid workflow response for ${workflowId}:`, workflow);
        return null;
      }
      
      // Ensure stageStatuses is properly populated with detailed information
      if (!workflow.stageStatuses) {
        workflow.stageStatuses = [];
      }
      
      // Validate and enrich each stage status with comprehensive mapping
      workflow.stageStatuses = workflow.stageStatuses.map(stage => ({
        ...stage,
        // Ensure all required fields are present with proper defaults
        stageName: stage.stageName || 'UNKNOWN_STAGE',
        status: stage.status || 'idle',
        progressPercentage: stage.progressPercentage || 0,
        jobId: stage.jobId || undefined,
        errorMessage: stage.errorMessage || undefined,
        executionTimeMs: stage.executionTimeMs || undefined,
        startedAt: stage.startedAt || undefined,
        completedAt: stage.completedAt || undefined,
        createdAt: stage.createdAt || undefined,
        dependsOn: stage.dependsOn || undefined,
        subStatusMessage: stage.subStatusMessage || undefined,
      }));
      
      // Ensure overall workflow fields are properly set with comprehensive mapping
      workflow.progressPercentage = workflow.progressPercentage || 0;
      workflow.sessionId = workflow.sessionId || '';
      workflow.taskDescription = workflow.taskDescription || undefined;
      workflow.projectDirectory = workflow.projectDirectory || undefined;
      workflow.createdAt = workflow.createdAt || undefined;
      workflow.updatedAt = workflow.updatedAt || undefined;
      workflow.completedAt = workflow.completedAt || undefined;
      workflow.totalExecutionTimeMs = workflow.totalExecutionTimeMs || undefined;
      workflow.errorMessage = workflow.errorMessage || undefined;
      
      return workflow;
    } catch (error) {
      console.error(`Failed to fetch workflow ${workflowId}:`, error);
      setError(error instanceof Error ? error.message : `Failed to fetch workflow ${workflowId}`);
      return null;
    }
  }, [setError]);

  /**
   * Cancel a workflow and all its pending/running jobs
   */
  const cancelWorkflow = useCallback(async (workflowId: string) => {
    try {
      setError(null);
      
      await invoke('cancel_file_finder_workflow', { workflowId });
      
      // Refresh workflows to get updated status
      await refreshWorkflows();
    } catch (error) {
      console.error(`Failed to cancel workflow ${workflowId}:`, error);
      setError(error instanceof Error ? error.message : `Failed to cancel workflow ${workflowId}`);
    }
  }, [setError, refreshWorkflows]);

  /**
   * Pause a workflow - prevents new stages from starting
   */
  const pauseWorkflow = useCallback(async (workflowId: string) => {
    try {
      setError(null);
      
      await invoke('pause_file_finder_workflow', { workflowId });
      
      // Refresh workflows to get updated status
      await refreshWorkflows();
    } catch (error) {
      console.error(`Failed to pause workflow ${workflowId}:`, error);
      setError(error instanceof Error ? error.message : `Failed to pause workflow ${workflowId}`);
    }
  }, [setError, refreshWorkflows]);

  /**
   * Resume a paused workflow - allows new stages to start
   */
  const resumeWorkflow = useCallback(async (workflowId: string) => {
    try {
      setError(null);
      
      await invoke('resume_file_finder_workflow', { workflowId });
      
      // Refresh workflows to get updated status
      await refreshWorkflows();
    } catch (error) {
      console.error(`Failed to resume workflow ${workflowId}:`, error);
      setError(error instanceof Error ? error.message : `Failed to resume workflow ${workflowId}`);
    }
  }, [setError, refreshWorkflows]);

  /**
   * Clear the current error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  /**
   * Auto-refresh workflows on mount
   */
  useEffect(() => {
    refreshWorkflows();
  }, [refreshWorkflows]);

  const actions: WorkflowManagerActions = {
    refreshWorkflows,
    getWorkflowById,
    cancelWorkflow,
    pauseWorkflow,
    resumeWorkflow,
    clearError,
  };

  return {
    ...state,
    actions,
  };
}

/**
 * Helper hook to get a specific workflow by ID with automatic refresh
 */
export function useWorkflowDetails(workflowId: string | null) {
  const [workflow, setWorkflow] = useState<WorkflowStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshWorkflow = useCallback(async () => {
    if (!workflowId) {
      setWorkflow(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const workflowData = await invoke<WorkflowStatusResponse>('get_workflow_details_command', { workflowId });
      
      // Validate the response
      if (!workflowData || !workflowData.workflowId) {
        console.warn(`Invalid workflow response for ${workflowId}:`, workflowData);
        setWorkflow(null);
        return;
      }
      
      // Ensure stageStatuses is properly populated with detailed information
      if (!workflowData.stageStatuses) {
        workflowData.stageStatuses = [];
      }
      
      // Validate and enrich each stage status with comprehensive mapping
      workflowData.stageStatuses = workflowData.stageStatuses.map(stage => ({
        ...stage,
        // Ensure all required fields are present with proper defaults
        stageName: stage.stageName || 'UNKNOWN_STAGE',
        status: stage.status || 'idle',
        progressPercentage: stage.progressPercentage || 0,
        jobId: stage.jobId || undefined,
        errorMessage: stage.errorMessage || undefined,
        executionTimeMs: stage.executionTimeMs || undefined,
        startedAt: stage.startedAt || undefined,
        completedAt: stage.completedAt || undefined,
        createdAt: stage.createdAt || undefined,
        dependsOn: stage.dependsOn || undefined,
        subStatusMessage: stage.subStatusMessage || undefined,
      }));
      
      // Ensure overall workflow fields are properly set with comprehensive mapping
      workflowData.progressPercentage = workflowData.progressPercentage || 0;
      workflowData.sessionId = workflowData.sessionId || '';
      workflowData.taskDescription = workflowData.taskDescription || undefined;
      workflowData.projectDirectory = workflowData.projectDirectory || undefined;
      workflowData.createdAt = workflowData.createdAt || undefined;
      workflowData.updatedAt = workflowData.updatedAt || undefined;
      workflowData.completedAt = workflowData.completedAt || undefined;
      workflowData.totalExecutionTimeMs = workflowData.totalExecutionTimeMs || undefined;
      workflowData.errorMessage = workflowData.errorMessage || undefined;
      
      setWorkflow(workflowData);
    } catch (error) {
      console.error(`Failed to fetch workflow ${workflowId}:`, error);
      setError(error instanceof Error ? error.message : `Failed to fetch workflow ${workflowId}`);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    refreshWorkflow();
  }, [refreshWorkflow]);

  return {
    workflow,
    loading,
    error,
    refresh: refreshWorkflow,
  };
}