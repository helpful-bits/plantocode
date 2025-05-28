import { generateDirectoryTreeAction } from "@/actions/file-system/directory-tree.actions";
import { normalizePath } from "@/utils/path-utils";

export async function runDirectoryTreeStage(
  projectDirectory: string
): Promise<string> {
  try {
    const normalizedPath = await normalizePath(projectDirectory);
    const result = await generateDirectoryTreeAction(normalizedPath);
    
    if (!result.isSuccess || !result.data?.directoryTree) {
      throw new Error(result.message || "Failed to generate directory tree: No directory tree string returned or action failed");
    }
    
    return result.data.directoryTree;
  } catch (error) {
    throw new Error(`Directory tree generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}