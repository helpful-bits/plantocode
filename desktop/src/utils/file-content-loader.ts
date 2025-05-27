import { readFileContent } from "./tauri-fs";
import { pathJoin } from "./tauri-fs";

/**
 * Load file contents for specified paths only
 * This is a minimal frontend wrapper for file operations
 *
 * @param projectDirectory The absolute path to the base directory for the files
 * @param filePathsToLoad Array of project-relative file paths to load
 * @returns A record mapping project-relative file paths to their contents (only for requested paths)
 */
export async function loadFileContents(
  projectDirectory: string,
  filePathsToLoad: string[]
): Promise<Record<string, string>> {
  // If no files to load, return empty object
  if (!filePathsToLoad.length) {
    return {};
  }

  const contents: Record<string, string> = {};

  // Load each file individually using the existing single-file command
  for (const filePath of filePathsToLoad) {
    try {
      // Convert relative path to absolute path
      const absolutePath = await pathJoin(projectDirectory, filePath);
      
      // Read the file content
      const fileContent = await readFileContent(absolutePath, projectDirectory);
      
      // Store content with the original relative path as the key
      contents[filePath] = fileContent;
    } catch (error) {
      console.error(`Error loading file ${filePath}:`, error);
      
      // Add error placeholder for this specific file
      contents[filePath] = `[Error loading file: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }

  return contents;
}
