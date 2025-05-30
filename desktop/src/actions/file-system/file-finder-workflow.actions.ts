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
export async function executeFileFinderWorkflowAction(
  args: FileFinderWorkflowArgs
): Promise<ActionState<FileFinderWorkflowResult>> {
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

    // Invoke the Rust command to execute the entire workflow
    const result = await invoke<FileFinderWorkflowResult>(
      "execute_file_finder_workflow_command",
      {
        args: {
          sessionId: args.sessionId,
          taskDescription: args.taskDescription,
          projectDirectory: args.projectDirectory,
          excludedPaths: args.excludedPaths || [],
          timeoutMs: args.timeoutMs,
        }
      }
    );

    return {
      isSuccess: true,
      message: result.success 
        ? `File finder workflow completed successfully with ${result.selectedFiles.length} files`
        : result.errorMessage || "Workflow completed with errors",
      data: result,
    };
  } catch (error) {
    return handleActionError(error) as ActionState<FileFinderWorkflowResult>;
  }
}