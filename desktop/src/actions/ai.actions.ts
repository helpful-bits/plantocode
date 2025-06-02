/**
 * AI Actions
 *
 * Direct actions for AI operations using Tauri invoke commands.
 * These replace the adapter layer previously used for AI API calls.
 */

import { invoke } from "@tauri-apps/api/core";

import { type ActionState, type TaskType } from "@/types";
import { createErrorState, createSuccessState } from "@/utils/error-handling";
import { handleActionError } from "@/utils/action-utils";


/**
 * Sends a generic prompt to an AI model and receives a streaming response. Uses 'genericLlmStream' task settings by default.
 */
export async function sendPromptToAiAction(
  promptText: string,
  sessionId: string,
  options?: { temperature?: number; streamingUpdates?: { onStart?: () => void } }
): Promise<ActionState<{ jobId: string }>> {
  // Validate inputs
  if (!promptText) {
    return createErrorState("Prompt cannot be empty.");
  }

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return createErrorState("Session ID is required and must be a string.");
  }

  try {
    // Get session details including project directory
    const sessionDetails = await invoke<{ projectDirectory: string }>("get_session_command", {
      sessionId: sessionId,
    });

    if (!sessionDetails) {
      return createErrorState("Session not found.");
    }

    const projectDirectory = sessionDetails.projectDirectory;

    // Set up streaming callbacks
    const { streamingUpdates, ...restOptions } = options || {};

    // If streaming updates callbacks are provided, call onStart
    if (streamingUpdates?.onStart) {
      streamingUpdates.onStart();
    }

    // Create a background job for generic LLM streaming
    // Backend will resolve model settings using resolve_model_settings if null values are passed
    const result = await invoke<{ jobId: string }>(
      "generic_llm_stream_command",
      {
        sessionId: sessionId,
        promptText: promptText,
        systemPrompt: null,
        projectDirectory: projectDirectory,
        model: null,
        temperature: restOptions?.temperature ?? null,
        maxOutputTokens: null,
        metadata: null,
      }
    );

    return createSuccessState(
      { jobId: result.jobId },
      "Streaming job created",
      { jobId: result.jobId }
    );
  } catch (error) {
    console.error(`[AI Action] Error preparing request:`, error);
    return handleActionError(error) as ActionState<{ jobId: string }>;
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
    return createErrorState("Invalid request ID");
  }

  try {
    // Cancel the background job
    await invoke("cancel_background_job_command", { jobId: requestId });

    return createSuccessState(null, "Request cancelled successfully");
  } catch (error) {
    return handleActionError(error) as ActionState<null>;
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
  const defaultData = {
    cancelledQueueRequests: 0,
    cancelledBackgroundJobs: 0,
  };

  // Validate session ID
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return { ...createErrorState("Invalid session ID"), data: defaultData };
  }

  try {
    // Call the Tauri command to cancel all session background jobs
    const cancelledCount = await invoke<number>("cancel_session_jobs_command", {
      sessionId: sessionId,
    });

    return createSuccessState(
      {
        cancelledQueueRequests: 0,
        cancelledBackgroundJobs: cancelledCount,
      },
      `${cancelledCount} background jobs cancelled for session`
    );
  } catch (error) {
    return { ...(handleActionError(error) as ActionState<typeof defaultData>), data: defaultData };
  }
}

/**
 * Initiate a generic AI streaming request as a background job
 * More flexible than sendPromptToAiAction - allows explicit model/temperature/token parameters
 * Backend handles model settings resolution via resolve_model_settings
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
    return createErrorState("Prompt text cannot be empty");
  }

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return createErrorState("Invalid or missing session ID");
  }

  try {
    // If no projectDirectory provided, derive it from the session
    let finalProjectDirectory = projectDirectory;
    if (!finalProjectDirectory && sessionId) {
      try {
        const sessionDetails = await invoke<{ projectDirectory: string }>("get_session_command", {
          sessionId: sessionId,
        });
        if (sessionDetails?.projectDirectory) {
          finalProjectDirectory = sessionDetails.projectDirectory;
        }
      } catch (error) {
        console.warn("Could not retrieve project directory from session:", error);
      }
    }

    // Call the Tauri command to create a generic stream job
    // Backend will resolve model settings using resolve_model_settings if null values are passed
    const result = await invoke<{ jobId: string }>(
      "generic_llm_stream_command",
      {
        sessionId: sessionId,
        promptText: promptText,
        systemPrompt: systemPrompt ?? null,
        projectDirectory: finalProjectDirectory ?? null,
        model: explicitModel ?? null,
        temperature: explicitTemperature ?? null,
        maxOutputTokens: explicitMaxTokens ?? null,
        metadata: metadata ?? null,
      }
    );

    return createSuccessState(
      { jobId: result.jobId },
      "Generic AI streaming job queued",
      { jobId: result.jobId }
    );
  } catch (error) {
    console.error("[initiateGenericAIStreamAction]", error);
    return handleActionError(error) as ActionState<{ jobId: string }>;
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
    return createErrorState("Prompt cannot be empty");
  }

  try {
    // TaskType is now snake_case, matching backend TaskType::to_string() output
    const response = await invoke<string>("generate_simple_text_command", {
      prompt,
      systemPrompt: systemPrompt ?? null,
      modelOverride: explicitModel ?? null,
      temperatureOverride: explicitTemperature ?? null,
      maxTokensOverride: explicitMaxTokens ?? null,
      taskType: taskTypeForSettings,
    });

    return createSuccessState(response, "Text generated successfully");
  } catch (error) {
    console.error("[generateSimpleTextAction]", error);
    return handleActionError(error) as ActionState<string>;
  }
}
