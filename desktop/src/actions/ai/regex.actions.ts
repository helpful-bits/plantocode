import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

/**
 * Creates a job to generate regex patterns based on a task description
 */
export async function generateRegexPatternsAction(
  taskDescription: string,
  projectDirectory: string,
  sessionId?: string,
  examples?: string[],
  targetLanguage?: string,
  targetField?: string
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


    // Call the Tauri command to generate regex
    const invokeResult = await invoke<{ jobId: string }>("generate_regex_command", {
      sessionId,
      projectDirectory,
      description: taskDescription,
      examples,
      targetLanguage,
      modelOverride: undefined,
      temperatureOverride: undefined,
      maxTokensOverride: undefined,
      targetField: targetField || undefined,
    });

    return {
      isSuccess: true,
      message: "Regex generation job started",
      data: { jobId: invokeResult.jobId },
    };
  } catch (error) {
    console.error(
      `[generateRegexPatternsAction] Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    );
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}
