import { generateRegexPatternsAction } from "@/actions/ai/regex-pattern-generation.actions";
import { normalizePath } from "@/utils/path-utils";

export async function runRegexPatternGenerationStage(
  activeSessionId: string,
  projectDirectory: string,
  taskDescription: string,
  directoryTreeContent: string | null
): Promise<string> {
  try {
    const normalizedPath = await normalizePath(projectDirectory);
    const result = await generateRegexPatternsAction(
      activeSessionId,
      normalizedPath,
      taskDescription,
      directoryTreeContent ?? undefined
    );
    
    if (!result.isSuccess || !result.data?.jobId) {
      throw new Error(result.message || "Failed to start regex pattern generation: No job ID returned or action failed");
    }
    
    return result.data.jobId;
  } catch (error) {
    throw new Error(`Regex generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}