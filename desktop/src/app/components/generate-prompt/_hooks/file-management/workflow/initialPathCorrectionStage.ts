import { createPathCorrectionJobAction } from "@/actions/ai/path-correction.actions";
import { normalizePath } from "@/utils/path-utils";

export async function runInitialPathCorrectionStage(
  activeSessionId: string,
  projectDirectory: string,
  unverifiedPaths: string[],
  taskDescription: string,
  directoryTreeContent: string | null
): Promise<string> {
  try {
    const normalizedPath = await normalizePath(projectDirectory);
    const result = await createPathCorrectionJobAction({
      sessionId: activeSessionId,
      projectDirectory: normalizedPath,
      pathsToCorrect: unverifiedPaths.join('\n'),
      contextDescription: taskDescription,
      directoryTree: directoryTreeContent ?? undefined
    });
    
    if (!result.isSuccess || !result.data?.jobId) {
      throw new Error(result.message || "Failed to start initial path correction: No job ID returned or action failed");
    }
    
    return result.data.jobId;
  } catch (error) {
    throw new Error(`Initial path correction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}