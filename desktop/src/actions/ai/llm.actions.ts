import { invoke } from "@tauri-apps/api/core";

import { type ActionState, type TaskType } from "@/types";

/**
 * Send a prompt to AI model and receive streaming response
 */
export async function sendPromptToGeminiAction(
  promptText: string,
  sessionId: string,
  options?: { temperature?: number; streamingUpdates?: { onStart?: () => void } }
): Promise<ActionState<{ requestId: string; savedFilePath: string | null }>> {
  // Validate inputs
  if (!promptText) {
    return { isSuccess: false, message: "Prompt cannot be empty." };
  }

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return {
      isSuccess: false,
      message: "Session ID is required and must be a string.",
    };
  }

  try {
    // Get session details including project directory
    const sessionDetails = await invoke<{ projectDirectory: string }>("get_session_command", {
      sessionId,
    });

    if (!sessionDetails) {
      return { isSuccess: false, message: "Session not found." };
    }

    const projectDirectory = sessionDetails.projectDirectory;

    // Set up streaming callbacks
    const { streamingUpdates, ...restOptions } = options || {};

    // If streaming updates callbacks are provided, call onStart
    if (streamingUpdates?.onStart) {
      streamingUpdates.onStart();
    }

    // Create a background job for generic LLM streaming
    const result = await invoke<{ jobId: string }>(
      "generic_llm_stream_command",
      {
        sessionId,
        promptText,
        projectDirectory,
        temperatureOverride: restOptions?.temperature,
      }
    );

    return {
      isSuccess: true,
      message: "Streaming job created",
      data: {
        requestId: result.jobId,
        savedFilePath: null,
      },
      metadata: {
        jobId: result.jobId,
      },
    };
  } catch (error) {
    console.error(`[Gemini Action] Error preparing request:`, error);
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error preparing request.",
    };
  }
}

/**
 * Initiate a generic AI streaming request as a background job
 */
export async function initiateGenericGeminiStreamAction(params: {
  sessionId: string;
  promptText: string;
  systemPrompt?: string;
  projectDirectory?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  metadata?: Record<string, unknown>;
}): Promise<ActionState<{ jobId: string }>> {
  const {
    sessionId,
    promptText,
    systemPrompt,
    projectDirectory,
    model: explicitModel,
    temperature: explicitTemperature,
    maxOutputTokens: explicitMaxTokens,
    metadata,
  } = params;

  if (!promptText.trim()) {
    return { isSuccess: false, message: "Prompt text cannot be empty" };
  }

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return { isSuccess: false, message: "Invalid or missing session ID" };
  }

  try {
    // Call the Tauri command to create a generic stream job
    // The backend will handle retrieving project settings
    const result = await invoke<{ jobId: string }>(
      "generic_llm_stream_command",
      {
        sessionId,
        promptText,
        systemPrompt,
        projectDirectory,
        modelOverride: explicitModel,
        temperatureOverride: explicitTemperature,
        maxTokensOverride: explicitMaxTokens,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      }
    );

    return {
      isSuccess: true,
      message: "Generic AI streaming job queued",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
      },
    };
  } catch (error) {
    console.error("[initiateGenericGeminiStreamAction]", error);

    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error initiating streaming job",
      error: error instanceof Error ? error : new Error("Unknown error"),
    };
  }
}

/**
 * Generate simple text using a non-streaming AI model
 *
 * This action uses the generic LLM stream command with synchronous completion
 * waiting for the job to finish to return direct results.
 */
export async function generateSimpleTextAction(params: {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  projectDirectory?: string;
  taskTypeForSettings?: TaskType;
}): Promise<ActionState<string>> {
  const {
    prompt,
    systemPrompt,
    model,
    temperature,
    maxOutputTokens,
    projectDirectory,
    taskTypeForSettings,
  } = params;

  if (!prompt || !prompt.trim()) {
    return { isSuccess: false, message: "Prompt cannot be empty" };
  }

  try {
    // Create a temporary session ID if not part of a larger session context
    const tempSessionId = `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Use generic_llm_stream_command with sync completion option
    const result = await invoke<{ jobId: string }>(
      "generic_llm_stream_command",
      {
        sessionId: tempSessionId,
        promptText: prompt,
        systemPrompt,
        projectDirectory,
        modelOverride: model,
        temperatureOverride: temperature,
        maxTokensOverride: maxOutputTokens,
        metadata: JSON.stringify({
          waitForCompletion: true,
          taskTypeForSettings,
          isSimpleTextGeneration: true,
        }),
      }
    );

    // Get the completed job to extract the response
    const jobResult = await invoke<{ response: string }>("get_background_job_by_id_command", {
      jobId: result.jobId,
    });

    if (!jobResult || !jobResult.response) {
      return {
        isSuccess: false,
        message: "No response received from AI model",
        data: "",
      };
    }

    return {
      isSuccess: true,
      message: "Text generated successfully",
      data: jobResult.response,
    };
  } catch (error) {
    console.error("[generateSimpleTextAction]", error);

    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error generating text",
      error: error instanceof Error ? error : new Error("Unknown error"),
    };
  }
}
