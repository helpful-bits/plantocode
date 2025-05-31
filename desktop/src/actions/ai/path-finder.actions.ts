import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "@/utils/logger";
import { logError } from "@/utils/error-handling";
import type { ActionState } from "@/types";

const logger = createLogger({ namespace: "PathFinderActions" });

export interface EstimatePathFinderTokensArgs {
  sessionId: string;
  taskDescription: string;
  projectDirectory?: string;
  options?: {
    includeFileContents?: boolean;
    maxFilesWithContent?: number;
    priorityFileTypes?: string[];
    includedFiles?: string[];
    excludedFiles?: string[];
  };
  directoryTree?: string;
}

export interface TokenEstimateResponse {
  estimatedTokens: number;
  systemPromptTokens: number;
  userPromptTokens: number;
  totalTokens: number;
}

/**
 * Estimate the number of tokens a path finder prompt would use
 */
export async function estimatePathFinderTokensAction(
  args: EstimatePathFinderTokensArgs
): Promise<ActionState<TokenEstimateResponse>> {
  try {
    logger.debug("Estimating path finder tokens", { args });

    const response = await invoke<TokenEstimateResponse>(
      "estimate_path_finder_tokens_command",
      {
        sessionId: args.sessionId,
        taskDescription: args.taskDescription,
        projectDirectory: args.projectDirectory,
        options: args.options,
        directoryTree: args.directoryTree,
      }
    );

    logger.debug("Path finder token estimation successful", { response });

    return {
      isSuccess: true,
      data: response,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    
    logger.error("Failed to estimate path finder tokens", { error, args });
    
    await logError(error as Error, "Path Finder Token Estimation Failed", {
      args,
      errorMessage,
    });

    return {
      isSuccess: false,
      message: errorMessage,
      error: error instanceof Error ? error : new Error(errorMessage),
    };
  }
}