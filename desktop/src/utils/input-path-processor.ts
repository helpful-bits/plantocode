import { makePathRelative } from "./path-utils";

interface PathResult {
  normalizedPath: string; // Path normalized relative to project directory
  originalPath: string; // Original path as provided/pasted
  isProjectPath: boolean; // Whether this is a path within the project directory
}

/**
 * Process a string containing pasted file paths
 *
 * @param pastedText Raw pasted text containing paths
 * @param projectDirectory Root directory of the project
 * @param existingFilePaths Set of existing file paths from the project
 * @returns Array of processed path results
 */
export async function processPastedPaths(
  pastedText: string,
  projectDirectory: string,
  existingFilePaths: Set<string>
): Promise<PathResult[]> {
  if (!pastedText || !pastedText.trim()) {
    return [];
  }

  // Parse the pasted paths
  const rawPaths = pastedText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  // Process each path
  return Promise.all(
    rawPaths.map(async (path) => {
      // Normalize the path relative to project directory
      const normalizedPath = await makePathRelative(path, projectDirectory);

      // Determine if this is a project path
      const isProjectPath =
        existingFilePaths.has(path) ||
        (await Promise.all(
          [...existingFilePaths].map(async (existingPath) => {
            const normalizedExisting = await makePathRelative(
              existingPath,
              projectDirectory
            );
            return normalizedExisting === normalizedPath;
          })
        ).then((results) => results.some(Boolean)));

      return {
        normalizedPath,
        originalPath: path,
        isProjectPath,
      };
    })
  );
}

/**
 * Find the matching project path for a normalized path
 *
 * @param normalizedPath Path normalized relative to project directory
 * @param projectDirectory Root directory of the project
 * @param existingFilePaths Map of original file paths to their contents
 * @returns The original project path if found, or null
 */
export async function findMatchingProjectPath(
  normalizedPath: string,
  projectDirectory: string,
  existingFilePaths: Record<string, string>
): Promise<string | null> {
  // Create a normalized map for better file path matching
  const normalizedToOriginal: Record<string, string> = {};

  // Process all paths and create the normalized mapping
  const results = await Promise.all(
    Object.keys(existingFilePaths).map(async (originalPath) => {
      const normalized = await makePathRelative(originalPath, projectDirectory);
      return { originalPath, normalized };
    })
  );

  // Populate the mapping from normalized results
  for (const { originalPath, normalized } of results) {
    normalizedToOriginal[normalized] = originalPath;
  }

  // Check direct match with normalized path
  if (normalizedToOriginal[normalizedPath]) {
    return normalizedToOriginal[normalizedPath];
  }

  // Check direct match with original path
  if (existingFilePaths[normalizedPath] !== undefined) {
    return normalizedPath;
  }

  return null;
}
