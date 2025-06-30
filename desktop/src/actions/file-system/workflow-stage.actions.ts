/**
 * Workflow Stage Actions
 * 
 * Actions for managing individual workflow stages, including retry functionality
 */

import { type ActionState } from "@/types/action-types";
import { invoke } from "@/utils/tauri-fs";
import { handleActionError } from "@/utils/action-utils";

/**
 * Retry a failed workflow stage
 * 
 * @param workflowId - The ID of the parent workflow
 * @param failedStageJobId - The job ID of the failed stage to retry
 * @returns Promise<ActionState<string>> - Returns the new job ID
 */
export async function retryWorkflowStageAction(
  workflowId: string,
  failedStageJobId: string
): Promise<ActionState<string>> {
  try {
    const result = await invoke<string>('retry_workflow_stage_command', {
      workflowId,
      failedStageJobId,
    });

    return {
      isSuccess: true,
      data: result,
      message: 'Workflow stage retry initiated successfully',
    };
  } catch (error) {
    return handleActionError(error) as ActionState<string>;
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
    await invoke<void>('cancel_workflow_stage_command', {
      workflowId,
      stageJobId,
    });

    return {
      isSuccess: true,
      data: undefined,
      message: 'Workflow stage cancellation initiated successfully',
    };
  } catch (error) {
    return handleActionError(error) as ActionState<void>;
  }
}