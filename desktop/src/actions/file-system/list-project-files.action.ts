import { type ActionState } from "@/types";
import { type NativeFileInfo, listFiles } from "@/utils/tauri-fs";
import { handleActionError } from "@/utils/action-utils";

// Request arguments for list_files_command - matches Rust struct
export interface ListFilesRequestArgs {
  directory: string;
  pattern?: string;
  includeStats?: boolean;
  exclude?: string[];
}

/**
 * List project files using direct Tauri command (replacement for background job approach)
 */
export async function listProjectFilesAction(
  args: ListFilesRequestArgs
): Promise<ActionState<NativeFileInfo[]>> {
  try {
    // Validate required directory parameter
    if (!args.directory?.trim()) {
      return {
        isSuccess: false,
        message: "Directory path is required",
      };
    }

    // Call the Tauri command using the wrapper
    const response = await listFiles(
      args.directory,
      args.pattern,
      args.includeStats,
      args.exclude
    );

    return {
      isSuccess: true,
      message: "Files listed successfully",
      data: response,
    };
  } catch (error) {
    console.error("Error listing project files:", error);
    return handleActionError(error) as ActionState<NativeFileInfo[]>;
  }
}