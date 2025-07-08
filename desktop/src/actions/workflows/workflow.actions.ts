import { invoke } from "@tauri-apps/api/core";
import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";
import { invoke as invokeFs } from "@/utils/tauri-fs";

export interface FileFinderWorkflowArgs {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
  excludedPaths?: string[];
  timeoutMs?: number;
}

export interface WorkflowIntermediateData {
  directoryTreeContent?: string;
  rawRegexPatterns?: any;
  locallyFilteredFiles: string[];
  initialVerifiedPaths: string[];
  initialUnverifiedPaths: string[];
  initialCorrectedPaths: string[];
  extendedVerifiedPaths: string[];
  extendedUnverifiedPaths: string[];
  extendedCorrectedPaths: string[];
}

export interface FileFinderWorkflowResult {
  success: boolean;
  selectedFiles: string[];
  intermediateData: WorkflowIntermediateData;
  errorMessage?: string;
}

export interface WorkflowCommandResponse {
  workflowId: string;
  firstStageJobId: string;
  status: string;
}

/**
 * Start a new file finder workflow using the WorkflowOrchestrator
 * Returns the workflow ID for tracking the overall workflow progress
 */
export async function startFileFinderWorkflowAction(
  args: FileFinderWorkflowArgs
): Promise<ActionState<{ workflowId: string }>> {
  try {
    // Validate required inputs
    if (!args.sessionId || typeof args.sessionId !== "string" || !args.sessionId.trim()) {
      return {
        isSuccess: false,
        message: "Invalid or missing session ID",
      };
    }

    if (!args.taskDescription || args.taskDescription.trim().length < 10) {
      return {
        isSuccess: false,
        message: "Please provide a more detailed task description (minimum 10 characters). This helps the AI find the most relevant files for your project.",
      };
    }

    if (!args.projectDirectory || typeof args.projectDirectory !== "string" || !args.projectDirectory.trim()) {
      return {
        isSuccess: false,
        message: "Invalid or missing project directory",
      };
    }

    // Invoke the new workflow orchestrator command
    const result = await invoke<WorkflowCommandResponse>(
      "start_file_finder_workflow",
      {
        sessionId: args.sessionId,
        taskDescription: args.taskDescription,
        projectDirectory: args.projectDirectory,
        excludedPaths: args.excludedPaths || [],
        timeoutMs: args.timeoutMs,
      }
    );

    return {
      isSuccess: true,
      message: `File finder workflow started successfully: ${result.workflowId}`,
      data: { workflowId: result.workflowId },
    };
  } catch (error) {
    return handleActionError(error) as ActionState<{ workflowId: string }>;
  }
}

export async function startWebSearchWorkflowOrchestratorAction(
  args: FileFinderWorkflowArgs
): Promise<ActionState<{ workflowId: string }>> {
  try {
    // Validate required inputs
    if (!args.sessionId || typeof args.sessionId !== "string" || !args.sessionId.trim()) {
      return {
        isSuccess: false,
        message: "Invalid or missing session ID",
      };
    }

    if (!args.taskDescription || args.taskDescription.trim().length < 10) {
      return {
        isSuccess: false,
        message: "Please provide a more detailed task description (minimum 10 characters). This helps the AI find the most relevant information for your project.",
      };
    }

    if (!args.projectDirectory || typeof args.projectDirectory !== "string" || !args.projectDirectory.trim()) {
      return {
        isSuccess: false,
        message: "Invalid or missing project directory",
      };
    }

    // Invoke the new web search workflow command
    const result = await invoke<WorkflowCommandResponse>(
      "start_web_search_workflow",
      {
        sessionId: args.sessionId,
        taskDescription: args.taskDescription,
        projectDirectory: args.projectDirectory,
        excludedPaths: args.excludedPaths || [],
        timeoutMs: args.timeoutMs,
      }
    );

    return {
      isSuccess: true,
      message: `Web search workflow started successfully: ${result.workflowId}`,
      data: { workflowId: result.workflowId },
    };
  } catch (error) {
    return handleActionError(error) as ActionState<{ workflowId: string }>;
  }
}

export async function cancelWorkflowAction(
  workflowId: string
): Promise<ActionState<void>> {
  try {
    // Validate required input
    if (!workflowId || typeof workflowId !== "string" || !workflowId.trim()) {
      return {
        isSuccess: false,
        message: "Invalid or missing workflow ID",
      };
    }

    // Invoke the cancel workflow command
    await invoke<void>("cancel_file_finder_workflow", {
      workflowId: workflowId,
    });

    return {
      isSuccess: true,
      message: `Workflow ${workflowId} canceled successfully`,
    };
  } catch (error) {
    return handleActionError(error) as ActionState<void>;
  }
}

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
    const result = await invokeFs<string>('retry_workflow_stage_command', {
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
    await invokeFs<void>('cancel_workflow_stage_command', {
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


