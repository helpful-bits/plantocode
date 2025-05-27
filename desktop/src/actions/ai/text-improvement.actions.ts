import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";

export interface ImproveTextOptions {
  text: string;
  sessionId: string;
  improvementType?: string;
  language?: string;
  projectDirectory?: string;
  targetField?: string;
  modelOverride?: string;
  temperatureOverride?: number;
  maxTokensOverride?: number;
}

/**
 * Create a job to improve text with AI
 */
export async function improveSelectedTextAction(
  options: ImproveTextOptions | string,
  projectDirectory?: string,
  sessionId?: string,
  targetField?: string
): Promise<ActionState<{ jobId: string }>> {
  try {
    // Handle both new object-style and legacy string parameters
    let text: string;
    let actualSessionId: string;
    let actualProjectDirectory: string | undefined;
    let improvementType: string = "improve";
    let language: string | undefined;
    let targetFieldParam: string | undefined;
    let modelOverride: string | undefined;
    let temperatureOverride: number | undefined;
    let maxTokensOverride: number | undefined;

    if (typeof options === "string") {
      // Legacy format
      text = options;
      actualSessionId = sessionId || "";
      actualProjectDirectory = projectDirectory;
      targetFieldParam = targetField;
    } else {
      // New object format
      text = options.text;
      actualSessionId = options.sessionId;
      actualProjectDirectory = options.projectDirectory ?? projectDirectory;
      improvementType = options.improvementType || "improve";
      language = options.language;
      targetFieldParam = options.targetField ?? targetField;
      modelOverride = options.modelOverride;
      temperatureOverride = options.temperatureOverride;
      maxTokensOverride = options.maxTokensOverride;
    }

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

    // Call the Tauri command to improve text
    // Ensure projectDirectory is undefined if not available (matches Rust Option<String>)
    const result = await invoke<{ jobId: string }>("improve_text_command", {
      sessionId: actualSessionId,
      text,
      improvementType,
      language,
      projectDirectory: actualProjectDirectory || undefined,
      modelOverride,
      temperatureOverride,
      maxTokensOverride,
      targetField: targetFieldParam,
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
    return {
      isSuccess: false,
      message:
        error instanceof Error ? error.message : "Failed to improve text",
    };
  }
}
