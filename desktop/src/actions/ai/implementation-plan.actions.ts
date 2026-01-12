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
    const result = await invoke<{ jobId: string; durationMs?: number }>(
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
        durationMs: result.durationMs,
      },
    };
  } catch (error) {
    console.error("[createImplementationPlanAction]", error);
    return handleActionError(error) as ActionState<{ jobId?: string }>;
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

/**
 * Create a merged implementation plan from multiple source plans
 */
export async function createMergedImplementationPlanAction(
  sessionId: string,
  sourceJobIds: string[],
  mergeInstructions?: string
): Promise<ActionState<{ jobId: string }>> {
  try {
    const result = await invoke<{ jobId: string }>(
      "create_merged_implementation_plan_command",
      {
        sessionId,
        sourceJobIds,
        mergeInstructions,
      }
    );

    return {
      isSuccess: true,
      message: "Merge implementation plan started",
      data: { jobId: result.jobId },
    };
  } catch (error) {
    console.error("Failed to create merged implementation plan:", error);
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}

export interface PlanMarkdownResponse {
  jobId: string;
  markdown: string;
  xmlContent: string;
}

export async function generatePlanMarkdownAction(
  jobId: string
): Promise<ActionState<PlanMarkdownResponse>> {
  try {
    if (!jobId) {
      throw new Error("jobId is required");
    }

    const data = await invoke<PlanMarkdownResponse>(
      "generate_plan_markdown_command",
      { jobId }
    );

    return {
      isSuccess: true,
      message: "Markdown generated successfully",
      data,
    };
  } catch (err) {
    return handleActionError(err) as ActionState<PlanMarkdownResponse>;
  }
}
