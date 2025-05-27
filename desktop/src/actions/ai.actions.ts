/**
 * AI Actions
 *
 * Direct actions for AI operations using Tauri invoke commands.
 * These replace the adapter layer previously used for AI API calls.
 */

import { invoke } from "@tauri-apps/api/core";

import { type ActionState, type TaskType } from "@/types";

import { getModelSettingsForProject } from "./project-settings.actions";

/**
 * Send a prompt to AI model and receive streaming response
 * Specifically designed for implementation plan generation with appropriate model settings
 */
export async function sendPromptToAiAction(
  promptText: string,
  sessionId: string,
  options?: { temperature?: number; streamingUpdates?: { onStart?: () => void } }
): Promise<ActionState<{ jobId: string }>> {
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

    // Get the project-specific model settings - use generic LLM stream settings or fallback to unknown
    const allSettings = await getModelSettingsForProject(projectDirectory);
    const modelSettings = allSettings.data?.genericLlmStream || 
                         allSettings.data?.unknown || {
      model: undefined,
      temperature: undefined,
      maxTokens: undefined,
    };

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
        promptText: promptText,
        systemPrompt: null,
        projectDirectory: projectDirectory,
        model: modelSettings.model,
        temperature:
          restOptions?.temperature || modelSettings.temperature || 0.7,
        maxOutputTokens: modelSettings.maxTokens || 1000,
        metadata: null,
      }
    );

    return {
      isSuccess: true,
      message: "Streaming job created",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
      },
    };
  } catch (error) {
    console.error(`[AI Action] Error preparing request:`, error);
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
 * Cancel a specific AI request (background job)
 */
export async function cancelAiRequestAction(
  requestId: string
): Promise<ActionState<null>> {
  // Validate request ID
  if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
    return {
      isSuccess: false,
      message: "Invalid request ID",
      data: null,
    };
  }

  try {
    // Cancel the background job
    await invoke("cancel_background_job_command", { jobId: requestId });

    return {
      isSuccess: true,
      message: "Request cancelled successfully",
      data: null,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error cancelling request",
      data: null,
    };
  }
}

/**
 * Cancel all running AI requests for a session
 */
export async function cancelSessionRequestsAction(sessionId: string): Promise<
  ActionState<{
    cancelledQueueRequests: number;
    cancelledBackgroundJobs: number;
  }>
> {
  // Validate session ID
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return {
      isSuccess: false,
      message: "Invalid session ID",
      data: {
        cancelledQueueRequests: 0,
        cancelledBackgroundJobs: 0,
      },
    };
  }

  try {
    // Call the Tauri command to cancel all session background jobs
    const cancelledCount = await invoke<number>("cancel_session_jobs_command", {
      sessionId,
    });

    return {
      isSuccess: true,
      message: `${cancelledCount} background jobs cancelled for session`,
      data: {
        cancelledQueueRequests: 0,
        cancelledBackgroundJobs: cancelledCount,
      },
    };
  } catch (error) {
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error cancelling session requests",
      data: {
        cancelledQueueRequests: 0,
        cancelledBackgroundJobs: 0,
      },
    };
  }
}

/**
 * Initiate a generic AI streaming request as a background job
 * More flexible than sendPromptToAiAction - allows explicit model/temperature/token parameters
 * or fetches settings for "genericLlmStream" task type by default
 */
export async function initiateGenericAiStreamAction(params: {
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
    // Get project settings if possible
    let modelSettings: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {
      model: undefined,
      temperature: undefined,
      maxTokens: undefined,
    };
    if (projectDirectory) {
      try {
        const allSettings = await getModelSettingsForProject(projectDirectory);
        modelSettings = allSettings.data?.genericLlmStream
          ? { ...allSettings.data.genericLlmStream }
          : {
              model: undefined,
              temperature: undefined,
              maxTokens: undefined,
            };
      } catch (error) {
        console.warn(
          `Could not retrieve project settings for ${projectDirectory}:`,
          error
        );
      }
    }

    // Call the Tauri command to create a generic stream job
    const result = await invoke<{ jobId: string }>(
      "generic_llm_stream_command",
      {
        sessionId,
        promptText,
        systemPrompt,
        projectDirectory,
        model: explicitModel || modelSettings.model,
        temperature:
          explicitTemperature !== undefined
            ? explicitTemperature
            : modelSettings.temperature,
        maxOutputTokens: explicitMaxTokens || modelSettings.maxTokens,
        metadata: metadata ? JSON.stringify(metadata) : null,
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
    console.error("[initiateGenericAIStreamAction]", error);

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
 * This action is used for quick text generation tasks such as titles or summaries
 * where streaming is not needed. Uses the direct `generate_simple_text_command` for efficiency.
 */
export async function generateSimpleTextAction(params: {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  taskTypeForSettings?: TaskType;
}): Promise<ActionState<string>> {
  const {
    prompt,
    systemPrompt,
    model: explicitModel,
    temperature: explicitTemperature,
    maxOutputTokens: explicitMaxTokens,
    taskTypeForSettings = "unknown",
  } = params;

  if (!prompt || !prompt.trim()) {
    return { isSuccess: false, message: "Prompt cannot be empty" };
  }

  try {
    // Map frontend TaskType values to backend-expected snake_case strings
    const mapFrontendTaskTypeToBackend = (frontendType: string): string => {
      switch (frontendType) {
        case "implementationPlan": return "implementation_plan";
        case "pathFinder": return "path_finder";
        case "textImprovement": return "text_improvement";
        case "transcription": return "voice_transcription"; // Explicitly voice_transcription
        case "voiceCorrection": return "voice_correction";
        case "pathCorrection": return "path_correction";
        case "regexGeneration": return "regex_generation";
        case "guidanceGeneration": return "guidance_generation";
        case "taskEnhancement": return "task_enhancement";
        case "genericLlmStream": return "generic_llm_stream";
        case "regexSummaryGeneration": return "regex_summary_generation";
        case "generateDirectoryTree": return "generate_directory_tree";
        case "textCorrectionPostTranscription": return "text_correction_post_transcription";
        // Add any other camelCase keys from TaskSettings if they differ from snake_case TaskType
        default: return frontendType; // Assume already snake_case or unknown
      }
    };
    
    const backendTaskTypeString = mapFrontendTaskTypeToBackend(taskTypeForSettings);

    // Instead of using OpenRouterClientAdapter, call Tauri command directly
    const response = await invoke<string>("generate_simple_text_command", {
      prompt,
      systemPrompt: systemPrompt,
      modelOverride: explicitModel,
      temperatureOverride: explicitTemperature,
      maxTokensOverride: explicitMaxTokens,
      taskType: backendTaskTypeString,
    });

    return {
      isSuccess: true,
      message: "Text generated successfully",
      data: response,
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
