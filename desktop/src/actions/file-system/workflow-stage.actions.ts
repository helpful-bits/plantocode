/**
 * Workflow Stage Actions
 * 
 * Actions for managing individual workflow stages, including retry functionality
 */

import { ActionState } from '@/types/action-types';
import { invoke } from '@tauri-apps/api/core';

/**
 * Retry a failed workflow stage
 * 
 * @param workflowId - The ID of the parent workflow
 * @param failedStageJobId - The job ID of the failed stage to retry
 * @returns Promise<ActionState<void>>
 */
export async function retryWorkflowStageAction(
  workflowId: string,
  failedStageJobId: string
): Promise<ActionState<void>> {
  try {
    await invoke('retry_workflow_stage_command', {
      workflowId,
      failedStageJobId,
    });

    return {
      isSuccess: true,
      data: undefined,
      message: 'Workflow stage retry initiated successfully',
    };
  } catch (error) {
    console.error('Failed to retry workflow stage:', error);
    
    return {
      isSuccess: false,
      error: error instanceof Error ? error : new Error('Unknown error occurred while retrying workflow stage'),
      message: 'Failed to retry workflow stage',
    };
  }
}

/**
 * Cancel a running workflow stage
 * 
 * @param workflowId - The ID of the parent workflow
 * @param stageJobId - The job ID of the stage to cancel
 * @returns Promise<ActionState<void>>
 */
export async function cancelWorkflowStageAction(
  workflowId: string, 
  stageJobId: string
): Promise<ActionState<void>> {
  try {
    await invoke('cancel_workflow_stage_command', {
      workflowId,
      stageJobId,
    });

    return {
      isSuccess: true,
      data: undefined,
      message: 'Workflow stage cancellation initiated successfully',
    };
  } catch (error) {
    console.error('Failed to cancel workflow stage:', error);
    
    return {
      isSuccess: false,
      error: error instanceof Error ? error : new Error('Unknown error occurred while canceling workflow stage'),
      message: 'Failed to cancel workflow stage',
    };
  }
}