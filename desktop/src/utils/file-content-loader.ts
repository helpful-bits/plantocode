import { invoke } from "@tauri-apps/api/core";

/**
 * Load file contents - simplified to use Tauri backend for all operations
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

  try {
    // Call the Tauri command to load files in batches
    const result = await invoke<{ contents: Record<string, string> }>(
      "read_file_contents_command",
      {
        projectDirectory,
        filePaths,
        maxSize: 100 * 1024, // 100KB max for UI display
      }
    );

    // Merge with existing contents
    return {
      ...existingContents,
      ...result.contents,
    };
  } catch (error) {
    console.error("Error loading file contents:", error);

    // Return existing contents plus error placeholders for requested files
    const contents = { ...existingContents };

    // Add error placeholders for files that failed to load
    for (const filePath of filePaths) {
      if (!contents[filePath]) {
        contents[filePath] =
          `[Error loading file: ${error instanceof Error ? error.message : String(error)}]`;
      }
    }

    return contents;
  }
}
