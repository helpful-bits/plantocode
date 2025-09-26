import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";
import { type TaskType } from "@/types/task-type-defs";

export async function estimatePromptTokensAction(params: {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
  relevantFiles: string[];
  selectedRootDirectories?: string[];
  taskType: TaskType;
  model: string;
  includeProjectStructure?: boolean;
}): Promise<ActionState<{
  estimatedTokens: number;
  systemPromptTokens: number;
  userPromptTokens: number;
  totalTokens: number;
}>> {
  try {
    const result = await invoke<{
      estimatedTokens: number;
      systemPromptTokens: number;
      userPromptTokens: number;
      totalTokens: number;
    }>("estimate_prompt_tokens_command", {
      sessionId: params.sessionId,
      taskDescription: params.taskDescription,
      projectDirectory: params.projectDirectory,
      relevantFiles: params.relevantFiles,
      selectedRootDirectories: params.selectedRootDirectories,
      taskType: params.taskType,
      model: params.model,
      includeProjectStructure: params.includeProjectStructure,
    });

    return {
      isSuccess: true,
      message: "Token estimation completed successfully",
      data: {
        estimatedTokens: result.estimatedTokens,
        systemPromptTokens: result.systemPromptTokens,
        userPromptTokens: result.userPromptTokens,
        totalTokens: result.totalTokens,
      },
    };
  } catch (error) {
    return handleActionError(error) as ActionState<{
      estimatedTokens: number;
      systemPromptTokens: number;
      userPromptTokens: number;
      totalTokens: number;
    }>;
  }
}

export async function getPromptAction(params: {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
  relevantFiles: string[];
  selectedRootDirectories?: string[];
  taskType: TaskType;
}): Promise<ActionState<{
  systemPrompt: string;
  userPrompt: string;
  combinedPrompt: string;
}>> {
  try {
    const result = await invoke<{
      systemPrompt: string;
      userPrompt: string;
      combinedPrompt: string;
    }>("get_prompt_command", {
      sessionId: params.sessionId,
      taskDescription: params.taskDescription,
      projectDirectory: params.projectDirectory,
      relevantFiles: params.relevantFiles,
      selectedRootDirectories: params.selectedRootDirectories,
      taskType: params.taskType,
    });

    return {
      isSuccess: true,
      message: "Prompt retrieved successfully",
      data: {
        systemPrompt: result.systemPrompt,
        userPrompt: result.userPrompt,
        combinedPrompt: result.combinedPrompt,
      },
    };
  } catch (error) {
    return handleActionError(error) as ActionState<{
      systemPrompt: string;
      userPrompt: string;
      combinedPrompt: string;
    }>;
  }
}

export interface SystemPromptResponse {
  systemPrompt: string;
  systemPromptTemplate: string;
  systemPromptId: string;
}

export interface GetSystemPromptForTaskArgs extends Record<string, unknown> {
  sessionId: string;
  taskType: string;
}

export async function getSystemPromptForTaskAction(
  args: GetSystemPromptForTaskArgs
): Promise<ActionState<SystemPromptResponse>> {
  try {
    const result = await invoke<SystemPromptResponse>('get_system_prompt_for_task', args);
    return { isSuccess: true, data: result };
  } catch (error) {
    return handleActionError(error) as ActionState<SystemPromptResponse>;
  }
}