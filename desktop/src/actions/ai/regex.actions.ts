import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";

/**
 * Creates a job to generate regex patterns based on a task description
 */
export async function generateRegexPatternsAction(
  taskDescription: string,
  _directoryTree?: string,
  projectDirectory?: string,
  sessionId?: string,
  examples?: string[],
  targetLanguage?: string
): Promise<ActionState<{ jobId: string }>> {
  try {
    if (!taskDescription || !taskDescription.trim()) {
      return { isSuccess: false, message: "Task description cannot be empty." };
    }

    if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
      return {
        isSuccess: false,
        message: "Active session required to generate regex patterns.",
      };
    }

    if (!projectDirectory || !projectDirectory.trim()) {
      return { isSuccess: false, message: "Project directory is required." };
    }


    // Call the Tauri command to generate regex
    const jobId = await invoke<string>("generate_regex_command", {
      sessionId,
      projectDirectory,
      description: taskDescription,
      examples: examples || undefined,
      targetLanguage: targetLanguage || undefined,
      // Model defaults are handled in Rust
    });

    return {
      isSuccess: true,
      message: "Regex generation job started",
      data: { jobId },
    };
  } catch (error) {
    console.error(
      `[generateRegexPatternsAction] Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to generate regex patterns",
    };
  }
}
