import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";
import { hashString } from "@/utils/hash";
import { type TaskType } from "@/types/task-type-defs";

// Debounce state for token estimation
let lastEstimateCallTs = 0;
let lastEstimateKey: string | null = null;
let inFlightEstimate: Promise<ActionState<{
  estimatedTokens: number;
  systemPromptTokens: number;
  userPromptTokens: number;
  totalTokens: number;
}>> | null = null;

function buildEstimateKey(params: {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
  relevantFiles: string[];
  selectedRootDirectories?: string[];
  taskType: TaskType;
  model: string;
  includeProjectStructure?: boolean;
}) {
  const relevantFiles = [...params.relevantFiles].sort();
  const selectedRoots = [...(params.selectedRootDirectories ?? [])].sort();
  const payload = [
    params.sessionId,
    params.taskType,
    params.model,
    params.projectDirectory,
    params.includeProjectStructure ? "1" : "0",
    relevantFiles.join("|"),
    selectedRoots.join("|"),
    params.taskDescription,
  ].join("::");
  return hashString(payload);
}

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
  const now = performance.now();
  const MIN_INTERVAL_MS = 250;
  const estimateKey = buildEstimateKey(params);

  // Return existing in-flight request if called too frequently AND same session
  // Invalidate cache when parameters change to prevent returning stale estimates
  if (inFlightEstimate && now - lastEstimateCallTs < MIN_INTERVAL_MS && lastEstimateKey === estimateKey) {
    return inFlightEstimate;
  }

  lastEstimateCallTs = now;
  lastEstimateKey = estimateKey;
  inFlightEstimate = (async () => {
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
    } finally {
      inFlightEstimate = null;
    }
  })();

  return inFlightEstimate;
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
