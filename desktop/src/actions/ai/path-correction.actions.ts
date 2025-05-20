import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";

/**
 * Correct paths based on task description and project structure
 */
export async function correctPathsAction(
  paths: string,
  projectDirectory?: string,
  sessionId?: string
): Promise<ActionState<{ correctedPaths: string[] }>> {
  if (!paths.trim()) {
    return { isSuccess: false, message: "No paths provided to correct" };
  }

  // Validate sessionId if provided
  if (
    sessionId !== undefined &&
    (typeof sessionId !== "string" || !sessionId.trim())
  ) {
    return {
      isSuccess: false,
      message: "Invalid session ID provided for path correction",
    };
  }

  try {
    // Parse input paths
    const pathsArray = paths
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    if (pathsArray.length === 0) {
      return { isSuccess: false, message: "No valid paths found in input" };
    }

    // Call the Tauri command for path correction
    // The backend will handle model selection and parameter settings
    const result = await invoke<{ corrected_paths: string[] }>(
      "correct_path_command",
      {
        paths: pathsArray,
        projectDirectory,
        sessionId,
      }
    );

    return {
      isSuccess: true,
      message: "Successfully corrected paths",
      data: { correctedPaths: result.corrected_paths },
    };
  } catch (error) {
    console.error("[correctPathsAction]", error);

    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error correcting paths",
      error: error instanceof Error ? error : new Error("Unknown error"),
    };
  }
}
