import { type ActionState } from "@/types";
import { type ProjectFileInfo } from "@/types/tauri-commands";
import { listProjectFiles } from "@/utils/tauri-fs";
import { handleActionError } from "@/utils/action-utils";

// Re-export ProjectFileInfo for convenience
export type { ProjectFileInfo };

// Request arguments for list_project_files_command
export interface ListProjectFilesRequestArgs {
  projectDirectory: string;
}

/**
 * List project files using git-based file discovery system
 */
export async function listProjectFilesAction(
  projectDirectory: string
): Promise<ActionState<ProjectFileInfo[]>>;
export async function listProjectFilesAction(
  args: ListProjectFilesRequestArgs
): Promise<ActionState<ProjectFileInfo[]>>;
export async function listProjectFilesAction(
  directoryOrArgs: string | ListProjectFilesRequestArgs
): Promise<ActionState<ProjectFileInfo[]>> {
  try {
    // Handle both string and object arguments
    const projectDirectory = typeof directoryOrArgs === 'string' 
      ? directoryOrArgs 
      : directoryOrArgs.projectDirectory;

    // Validate required directory parameter
    if (!projectDirectory?.trim()) {
      return {
        isSuccess: false,
        message: "Project directory path is required",
      };
    }

    // Call the Tauri command using the wrapper
    const response = await listProjectFiles(projectDirectory);

    return {
      isSuccess: true,
      message: "Project files listed successfully",
      data: response,
    };
  } catch (error) {
    console.error("Error listing project files:", error);
    return handleActionError(error) as ActionState<ProjectFileInfo[]>;
  }
}