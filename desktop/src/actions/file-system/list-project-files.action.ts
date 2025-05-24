import { type ActionState } from "@/types";
import { invoke } from "@tauri-apps/api/core";

// Request arguments for list_files_command - matches Rust struct
export interface ListFilesRequestArgs {
  directory: string;
  pattern?: string;
  include_stats?: boolean;
  exclude?: string[];
}

// Response structure for list_files_command - matches Rust struct
export interface ListFilesResponse {
  files: string[]; // List of file paths relative to the queried directory
  stats?: Array<{
    path: string; // Relative path to the queried directory
    size: number;
    modified_ms: number;
    created_ms?: number;
    accessed_ms?: number;
  }>;
  warning?: string;
  total_found_before_filtering?: number;
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
      includeStats: args.include_stats,
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