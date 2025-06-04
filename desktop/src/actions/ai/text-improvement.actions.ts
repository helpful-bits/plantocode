import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

export interface ImproveTextOptions {
  text: string;
  sessionId: string;
  projectDirectory?: string;
  targetField?: string;
  modelOverride?: string;
  temperatureOverride?: number;
  maxTokensOverride?: number;
}

/**
 * Create a job to improve text for clarity and grammar
 */
export async function improveSelectedTextAction(
  options: ImproveTextOptions
): Promise<ActionState<{ jobId: string }>> {
  try {
    // Extract parameters from options object
    const {
      text,
      sessionId: actualSessionId,
      projectDirectory: actualProjectDirectory,
      targetField: targetFieldParam,
      modelOverride,
      temperatureOverride,
      maxTokensOverride
    } = options;

    if (!text || !text.trim()) {
      return { isSuccess: false, message: "No text selected for improvement." };
    }

    // Add strict session ID validation - must have a valid session ID
    if (
      !actualSessionId ||
      typeof actualSessionId !== "string" ||
      !actualSessionId.trim()
    ) {
      return {
        isSuccess: false,
        message: "Active session required to improve text.",
      };
    }

    // If no projectDirectory provided, derive it from the session
    let finalProjectDirectory = actualProjectDirectory;
    if (!finalProjectDirectory && actualSessionId) {
      try {
        const sessionDetails = await invoke<{ projectDirectory: string }>("get_session_command", {
          sessionId: actualSessionId,
        });
        if (sessionDetails?.projectDirectory) {
          finalProjectDirectory = sessionDetails.projectDirectory;
        }
      } catch (error) {
        console.warn("Could not retrieve project directory from session:", error);
      }
    }

    // Call the Tauri command to improve text
    const result = await invoke<{ jobId: string }>("improve_text_command", {
      sessionId: actualSessionId,
      text,
      projectDirectory: finalProjectDirectory ?? null,
      modelOverride: modelOverride ?? null,
      temperatureOverride: temperatureOverride ?? null,
      maxTokensOverride: maxTokensOverride ?? null,
      targetField: targetFieldParam ?? null,
    });

    return {
      isSuccess: true,
      message: "Text improvement job started",
      data: { jobId: result.jobId },
      metadata: {
        isBackgroundJob: true,
        jobId: result.jobId,
        operationId: result.jobId,
        targetField: targetFieldParam,
      },
    };
  } catch (error) {
    console.error("Error improving text:", error);
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}
