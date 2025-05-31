import { invoke } from "@tauri-apps/api/core";
import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

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
        message: "Task description is required and must be at least 10 characters",
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
        session_id: args.sessionId,
        task_description: args.taskDescription,
        project_directory: args.projectDirectory,
        excluded_paths: args.excludedPaths || [],
        timeout_ms: args.timeoutMs,
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


