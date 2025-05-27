import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

/**
 * Create a background job to correct paths based on task description and project structure
 */
export async function createPathCorrectionJobAction(params: {
  sessionId: string;
  projectDirectory: string;
  pathsToCorrect: string;
  contextDescription?: string;
  modelOverride?: string;
  temperatureOverride?: number;
  maxTokensOverride?: number;
}): Promise<ActionState<{ jobId: string }>> {
  const { sessionId, projectDirectory, pathsToCorrect, contextDescription, modelOverride, temperatureOverride, maxTokensOverride } = params;

  if (!pathsToCorrect.trim()) {
    return { isSuccess: false, message: "No paths provided to correct" };
  }

  // Validate sessionId
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return {
      isSuccess: false,
      message: "Valid session ID is required for path correction",
    };
  }

  // Validate projectDirectory
  if (!projectDirectory || typeof projectDirectory !== "string" || !projectDirectory.trim()) {
    return {
      isSuccess: false,
      message: "Valid project directory is required for path correction",
    };
  }

  try {
    // Parse input paths
    const pathsArray = pathsToCorrect
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    if (pathsArray.length === 0) {
      return { isSuccess: false, message: "No valid paths found in input" };
    }

    // Call the Tauri command to create a path correction job
    const result = await invoke<{ jobId: string }>(
      "create_path_correction_job_command",
      {
        sessionId,
        projectDirectory,
        pathsToCorrect: pathsToCorrect,
        contextDescription,
        modelOverride,
        temperatureOverride,
        maxTokensOverride,
      }
    );

    return {
      isSuccess: true,
      message: "Path correction job created successfully",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        isBackgroundJob: true,
      },
    };
  } catch (error) {
    console.error("[createPathCorrectionJobAction]", error);
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}
