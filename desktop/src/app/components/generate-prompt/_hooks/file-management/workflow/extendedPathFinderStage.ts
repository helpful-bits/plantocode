import { findRelevantFilesAction } from "@/actions/path-finder/index";
import { normalizePath } from "@/utils/path-utils";

export async function runExtendedPathFinderStage(
  activeSessionId: string,
  projectDirectory: string,
  taskDescription: string,
  directoryTreeContent: string | null,
  currentVerifiedPaths: string[],
  excludedPaths: string[]
): Promise<string> {
  try {
    const normalizedPath = await normalizePath(projectDirectory);
    const options = {
      projectDirectory: normalizedPath,
      includedFiles: currentVerifiedPaths,
      forceExcludedFiles: excludedPaths,
      directoryTree: directoryTreeContent ?? undefined
    };

    const result = await findRelevantFilesAction({
      sessionId: activeSessionId,
      taskDescription,
      options
    });
    
    if (!result.isSuccess || !result.data?.jobId) {
      throw new Error(result.message || "Failed to start extended path finder: No job ID returned or action failed");
    }
    
    return result.data.jobId;
  } catch (error) {
    throw new Error(`Extended path finder failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}