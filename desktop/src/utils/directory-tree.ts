import { invoke } from "@tauri-apps/api/core";

/**
 * Generates a directory tree for a project directory using Rust backend
 *
 * This function creates a background job to generate a directory tree
 * and returns the job ID. The caller should listen for job completion
 * to get the actual tree string.
 *
 * @param projectDir The project directory path
 * @param selectedFiles Optional array of selected files to include in the tree
 * @returns A promise resolving to the job ID
 */
export async function generateDirectoryTree(
  projectDir: string,
  selectedFiles?: string[]
): Promise<string> {
  try {
    if (!projectDir?.trim()) {
      return ""; // Return empty string if no project directory
    }

    // Create options object
    const options =
      selectedFiles && selectedFiles.length > 0
        ? { included_files: selectedFiles }
        : undefined;

    // Create a background job for directory tree generation
    const jobId = await invoke<string>(
      "create_generate_directory_tree_job_command",
      {
        args: {
          project_directory: projectDir,
          session_id: "system", // Use a system session ID for non-session operations
          options,
        },
      }
    );

    return jobId;
  } catch (error) {
    console.error("Error generating directory tree:", error);
    return "";
  }
}
