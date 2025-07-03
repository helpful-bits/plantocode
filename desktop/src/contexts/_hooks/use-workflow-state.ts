import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { WorkflowState, WorkflowStatusEvent, WorkflowStage } from '@/types/workflow-types';

interface UseWorkflowStateOptions {
  workflowId?: string | null;
  enabled?: boolean;
}

interface UseWorkflowStateReturn {
  workflowState: WorkflowState | null;
  workflow: WorkflowState | null;
  results: any;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useWorkflowState({ 
  workflowId, 
  enabled = true 
}: UseWorkflowStateOptions = {}): UseWorkflowStateReturn {
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkflowState = async () => {
    if (!workflowId || !enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const state = await invoke('get_workflow_state', { workflowId });
      setWorkflowState(state as WorkflowState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workflow state');
    } finally {
      setIsLoading(false);
    }
  };

  // Listen for workflow events
  useEffect(() => {
    if (!workflowId || !enabled) return;

    const unlisten = listen<WorkflowStatusEvent>('workflow-status-event', (event) => {
      if (event.payload.workflowId === workflowId) {
        setWorkflowState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            status: event.payload.status,
            progressPercentage: event.payload.progress,
            currentStage: event.payload.currentStage as WorkflowStage,
            errorMessage: event.payload.errorMessage,
            updatedAt: Date.now()
          };
        });
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [workflowId, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchWorkflowState();
  }, [workflowId, enabled]);

  return {
    workflowState,
    workflow: workflowState,
    results: workflowState,
    isLoading,
    error,
    refetch: fetchWorkflowState
  };
}