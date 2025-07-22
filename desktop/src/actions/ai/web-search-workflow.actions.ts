import { invoke } from '@tauri-apps/api/core';
import type { ActionState } from '@/types/action-types';
import { handleActionError } from '@/utils/action-utils';

export interface StartWebSearchWorkflowArgs extends Record<string, unknown> {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
}

export interface StartWebSearchPromptsGenerationJobArgs extends Record<string, unknown> {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
}

export async function startWebSearchWorkflowAction(
  args: StartWebSearchWorkflowArgs
): Promise<ActionState<{ jobId: string }>> {
  try {
    const result = await invoke('start_web_search_workflow', args);
    return { isSuccess: true, data: result as { jobId: string } };
  } catch (error) {
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}

export async function startWebSearchPromptsGenerationJobAction(
  args: StartWebSearchPromptsGenerationJobArgs
): Promise<ActionState<{ jobId: string }>> {
  try {
    const result = await invoke('start_web_search_prompts_generation_job', args);
    return { isSuccess: true, data: result as { jobId: string } };
  } catch (error) {
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}