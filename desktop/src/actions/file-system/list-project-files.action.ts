import { type ActionState } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { type ListFilesResponse } from "@/utils/tauri-fs";

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
): Promise<ActionState<ListFilesResponse>> {
  try {
    // Validate required directory parameter
    if (!args.directory?.trim()) {
      return {
        isSuccess: false,
        message: "Directory path is required",
      };
    }

    // Call the Tauri command directly
    const response = await invoke<ListFilesResponse>("list_files_command", {
      directory: args.directory,
      pattern: args.pattern,
      includeStats: args.includeStats,
      exclude: args.exclude,
    });

    return {
      isSuccess: true,
      message: "Files listed successfully",
      data: response,
    };
  } catch (error) {
    console.error("Error listing project files:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to list project files",
    };
  }
}