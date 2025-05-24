import { readFileContent } from "./tauri-fs";
import { pathJoin } from "./tauri-fs";

/**
 * Load file contents - uses existing single-file Tauri command in a loop
 * This is a minimal frontend wrapper for file operations
 *
 * @param projectDirectory The absolute path to the base directory for the files
 * @param filePaths Array of project-relative file paths to load
 * @param existingContents Optional existing file contents map to use as a base
 * @returns A record mapping project-relative file paths to their contents
 */
export async function loadFileContents(
  projectDirectory: string,
  filePaths: string[],
  existingContents: Record<string, string> = {}
): Promise<Record<string, string>> {
  // If no files to load, return existing contents
  if (!filePaths.length) {
    return existingContents;
  }

  // Start with existing contents
  const contents = { ...existingContents };

  // Load each file individually using the existing single-file command
  for (const filePath of filePaths) {
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
