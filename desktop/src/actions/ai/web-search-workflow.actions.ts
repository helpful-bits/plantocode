import { invoke } from '@tauri-apps/api/core';
import type { ActionState } from '@/types/action-types';
import { handleActionError } from '@/utils/action-utils';
import type { WorkflowCommandResponse } from '@/types/workflow-types';

export interface StartWebSearchWorkflowArgs extends Record<string, unknown> {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
}

export async function startWebSearchWorkflowAction(
  args: StartWebSearchWorkflowArgs
): Promise<ActionState<WorkflowCommandResponse>> {
  try {
    const result = await invoke('start_web_search_workflow', args);
    return { isSuccess: true, data: result as WorkflowCommandResponse };
  } catch (error) {
    return handleActionError(error) as ActionState<WorkflowCommandResponse>;
  }
}