import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

interface ImplementationPlanDataResponse {
  id: string;
  title?: string;
  description?: string;
  content?: string;
  contentFormat?: string;
  createdAt: string;
}

/**
 * Create an implementation plan for a given task
 */
export async function createImplementationPlanAction(params: {
  projectDirectory: string;
  taskDescription: string;
  relevantFiles: string[];
  sessionId: string;
  projectStructure?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<ActionState<{ jobId?: string }>> {
  const {
    projectDirectory,
    taskDescription,
    relevantFiles,
    sessionId,
    projectStructure,
    model,
    temperature,
    maxTokens,
  } = params;

  if (!taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty" };
  }

  if (!relevantFiles.length) {
    return { isSuccess: false, message: "No relevant files provided" };
  }

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return { isSuccess: false, message: "Invalid or missing session ID" };
  }

  try {
    // Call the Tauri command to create the implementation plan
    // The backend now handles dynamic title generation and all prompt construction
    const result = await invoke<{ jobId: string }>(
      "create_implementation_plan_command",
      {
        sessionId,
        taskDescription,
        projectDirectory,
        relevantFiles,
        projectStructure: projectStructure ?? null,
        model: model ?? null,
        temperature: temperature ?? null,
        maxTokens: maxTokens ?? null,
      }
    );

    return {
      isSuccess: true,
      message: "Implementation plan generation started",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        isBackgroundJob: true,
      },
    };
  } catch (error) {
    console.error("[createImplementationPlanAction]", error);
    return handleActionError(error) as ActionState<{ jobId?: string }>;
  }
}

/**
 * Estimate the number of tokens an implementation plan prompt would use
 */
export async function estimateImplementationPlanTokensAction(params: {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
  relevantFiles: string[];
  projectStructure?: string;
}): Promise<ActionState<{
  estimatedTokens: number;
  systemPromptTokens: number;
  userPromptTokens: number;
  totalTokens: number;
}>> {
  const {
    sessionId,
    taskDescription,
    projectDirectory,
    relevantFiles,
    projectStructure,
  } = params;

  if (!taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty" };
  }

  if (!relevantFiles.length) {
    return { isSuccess: false, message: "No relevant files provided" };
  }

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return { isSuccess: false, message: "Invalid or missing session ID" };
  }

  try {
    const result = await invoke<{
      estimatedTokens: number;
      systemPromptTokens: number;
      userPromptTokens: number;
      totalTokens: number;
    }>("estimate_implementation_plan_tokens_command", {
      sessionId,
      taskDescription,
      projectDirectory,
      relevantFiles,
      projectStructure: projectStructure ?? null,
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
    console.error("[estimateImplementationPlanTokensAction]", error);
    return handleActionError(error) as ActionState<{
      estimatedTokens: number;
      systemPromptTokens: number;
      userPromptTokens: number;
      totalTokens: number;
    }>;
  }
}

/**
 * Get the prompt that would be used to generate an implementation plan
 */
export async function getImplementationPlanPromptAction(params: {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
  relevantFiles: string[];
  projectStructure?: string;
}): Promise<ActionState<{
  systemPrompt: string;
  userPrompt: string;
  combinedPrompt: string;
}>> {
  const {
    sessionId,
    taskDescription,
    projectDirectory,
    relevantFiles,
    projectStructure,
  } = params;

  if (!taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty" };
  }

  if (!relevantFiles.length) {
    return { isSuccess: false, message: "No relevant files provided" };
  }

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return { isSuccess: false, message: "Invalid or missing session ID" };
  }

  try {
    const result = await invoke<{
      systemPrompt: string;
      userPrompt: string;
      combinedPrompt: string;
    }>("get_implementation_plan_prompt_command", {
      sessionId,
      taskDescription,
      projectDirectory,
      relevantFiles,
      projectStructure: projectStructure ?? null,
    });

    return {
      isSuccess: true,
      message: "Implementation plan prompt retrieved successfully",
      data: {
        systemPrompt: result.systemPrompt,
        userPrompt: result.userPrompt,
        combinedPrompt: result.combinedPrompt,
      },
    };
  } catch (error) {
    console.error("[getImplementationPlanPromptAction]", error);
    return handleActionError(error) as ActionState<{
      systemPrompt: string;
      userPrompt: string;
      combinedPrompt: string;
    }>;
  }
}

/**
 * Read an implementation plan by its job ID
 */
export async function readImplementationPlanAction(jobId: string): Promise<
  ActionState<{
    id: string;
    title?: string;
    description?: string;
    content?: string;
    contentFormat?: string;
    createdAt: string;
  }>
> {
  if (!jobId || typeof jobId !== "string" || jobId.trim() === "") {
    return {
      isSuccess: false,
      message: "Invalid job ID provided",
      data: {
        id: "",
        createdAt: new Date().toISOString(),
      },
    };
  }

  try {
    // Call the Tauri command to read the implementation plan
    const result = await invoke<ImplementationPlanDataResponse>(
      "read_implementation_plan_command",
      {
        jobId,
      }
    );

    return {
      isSuccess: true,
      message: "Implementation plan retrieved successfully",
      data: {
        id: result.id,
        title: result.title,
        description: result.description,
        content: result.content,
        contentFormat: result.contentFormat,
        createdAt: result.createdAt,
      },
    };
  } catch (error) {
    console.error("[readImplementationPlanAction]", error);
    const errorState = handleActionError(error);
    return {
      ...errorState,
      data: {
        id: jobId,
        createdAt: new Date().toISOString(),
      },
    } as ActionState<{
      id: string;
      title?: string;
      description?: string;
      content?: string;
      contentFormat?: string;
      createdAt: string;
    }>;
  }
}
