"use server";

import { ActionState } from "@/types";
import claudeClient from "@/lib/api/claude-client";

export interface ImproveTextOptions {
  text: string;
  sessionId?: string | null;
  mode?: string;
  projectDirectory?: string;
  targetField?: string;
}
 
export async function improveSelectedTextAction(
  options: ImproveTextOptions | string,
  projectDirectory?: string,
  sessionId?: string,
  targetField?: string // Add target field parameter
): Promise<ActionState<string | { isBackgroundJob: true; jobId: string; }>> {
  try {
    // Handle both new object-style and legacy string parameters
    let text: string;
    let actualSessionId: string | undefined | null;
    let actualProjectDirectory: string | undefined;
    let mode: string | undefined;

    let targetFieldParam: string | undefined;

    if (typeof options === 'string') {
      // Legacy format
      text = options;
      actualSessionId = sessionId;
      actualProjectDirectory = projectDirectory;
      targetFieldParam = targetField;
    } else {
      // New object format
      text = options.text;
      actualSessionId = options.sessionId ?? sessionId;
      actualProjectDirectory = options.projectDirectory ?? projectDirectory;
      mode = options.mode;
      targetFieldParam = options.targetField ?? targetField;
    }

    if (!text || !text.trim()) {
      return { isSuccess: false, message: "No text selected for improvement." };
    }

    // Add strict session ID validation - must have a valid session ID
    if (!actualSessionId || typeof actualSessionId !== 'string' || !actualSessionId.trim()) {
      return { isSuccess: false, message: "Active session required to improve text." };
    }

    // Validate that we have a project directory
    if (!actualProjectDirectory) {
      return { isSuccess: false, message: "Project directory is required for text improvement." };
    }
    
    // Use the Claude client to improve the text with project settings
    const result = await claudeClient.improveText(
      text, 
      actualSessionId || undefined,
      { 
        preserveFormatting: true,
        targetField: targetFieldParam // Pass target field to the Claude client
      },
      actualProjectDirectory
    );

    // Ensure we properly return the background job ID if it's a background job
    if (result.isSuccess && result.metadata?.isBackgroundJob && result.metadata?.jobId) {
      return {
        isSuccess: true,
        message: "Text improvement is being processed in the background.",
        data: { isBackgroundJob: true, jobId: result.metadata.jobId },
        metadata: { 
          isBackgroundJob: true, 
          jobId: result.metadata.jobId,
          operationId: result.metadata.jobId, // Used by some UI components
          targetField: targetFieldParam // Include the target field in response metadata
        }
      };
    }
    
    // Otherwise return the immediate result
    return result;
  } catch (error) {
    console.error("Error improving text with Claude:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to improve text",
    };
  }
}
