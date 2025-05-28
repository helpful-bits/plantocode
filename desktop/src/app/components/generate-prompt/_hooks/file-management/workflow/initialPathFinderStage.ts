import { findRelevantFilesAction } from "@/actions/path-finder/index";
import { normalizePath } from "@/utils/path-utils";

export async function runInitialPathFinderStage(
  activeSessionId: string,
  projectDirectory: string,
  taskDescription: string,
  directoryTreeContent: string | null,
  locallyFilteredFiles: string[],
  excludedPaths: string[]
): Promise<string> {
  try {
    const normalizedPath = await normalizePath(projectDirectory);
    const options = {
      projectDirectory: normalizedPath,
      includedFiles: locallyFilteredFiles,
      forceExcludedFiles: excludedPaths,
      directoryTree: directoryTreeContent ?? undefined
    };

    const result = await findRelevantFilesAction({
      sessionId: activeSessionId,
      taskDescription,
      options
    });
    
    if (!result.isSuccess || !result.data?.jobId) {
      throw new Error(result.message || "Failed to start initial path finder: No job ID returned or action failed");
    }
    
    return result.data.jobId;
  } catch (error) {
    throw new Error(`Initial path finder failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}