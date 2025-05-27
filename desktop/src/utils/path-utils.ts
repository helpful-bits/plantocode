import * as tauriFs from "@/utils/tauri-fs";

/**
 * Normalize a path for display consistency
 * This is the original string-based normalization, kept for backward compatibility
 * For canonical file system paths, use normalizePath instead
 */
export async function normalizePathForDisplayConsistency(inputPath: string): Promise<string> {
  if (!inputPath) return "";

  // Use the Rust-backed normalization function for consistency
  return await tauriFs.normalizePath(inputPath);
}

/**
 * Canonical path normalizer - standard function for all file system operations
 * This should be used for any paths that will interact with the backend or file system
 */
export async function normalizePath(inputPath: string): Promise<string> {
  if (!inputPath) return "";
  return await tauriFs.normalizePath(inputPath);
}

/**
 * Make a path relative to a base directory
 * For display purposes, the base directory is usually the project root
 */
export async function makePathRelative(
  absolutePath: string,
  baseDirectory?: string
): Promise<string> {
  if (!absolutePath) return "";
  if (!baseDirectory) return absolutePath;

  const normalizedBase = await normalizePath(baseDirectory);
  const normalizedPath = await normalizePath(absolutePath);

  // Skip if base is not a prefix of the path (allowing trailing slash differences)
  const baseWithTrailingSlash = normalizedBase.endsWith("/")
    ? normalizedBase
    : `${normalizedBase}/`;

  if (normalizedPath === normalizedBase) {
    return ".";
  } else if (normalizedPath.startsWith(baseWithTrailingSlash)) {
    return normalizedPath.slice(baseWithTrailingSlash.length);
  } else if (normalizedPath.startsWith(normalizedBase + "/")) {
    return normalizedPath.slice(normalizedBase.length + 1);
  }

  return absolutePath;
}

/**
 * Creates a comparable relative path for consistent file identification
 * This ensures consistent path formatting across all file management components
 * Synchronous version for project-relative path normalization
 */
export function ensureProjectRelativePath(relativePath: string): string {
  if (!relativePath) return "";
  let comparablePath = relativePath.trim().replace(/\\/g, "/");
  // Remove leading "./" or "/"
  if (comparablePath.startsWith("./")) {
    comparablePath = comparablePath.substring(2);
  } else if (comparablePath.startsWith("/")) {
    comparablePath = comparablePath.substring(1);
  }
  // Remove trailing slash if it's not the root itself
  if (comparablePath.endsWith("/") && comparablePath.length > 1) {
    comparablePath = comparablePath.slice(0, -1);
  }
  return comparablePath;
}

/**
 * Parse file paths from AI-generated response text
 * Handles various formats that might be returned by AI
 */
export async function parseFilePathsFromAIResponse(
  response: string,
  projectDirectory?: string
): Promise<string[]> {
  if (!response || typeof response !== "string") {
    return [];
  }

  // Try to find paths in the text, preferring paths on their own lines
  const paths: string[] = [];

  // Common patterns for file paths in AI responses
  const patterns = [
    // Paths on their own lines or with numbers
    /^\s*(?:\d+\.\s*)?([^:\n\r]+\.[a-zA-Z0-9]+)\s*$/gm,

    // Paths in markdown lists
    /^\s*[-*]\s+([^:\n\r]+\.[a-zA-Z0-9]+)\s*$/gm,

    // Paths in markdown code blocks
    /`([^`\n\r]+\.[a-zA-Z0-9]+)`/g,

    // Paths with relative prefixes (./something.js)
    /(?:^|\s)(\.{1,2}\/[^\s,:"']+\.[a-zA-Z0-9]+)/g,

    // More complex paths with directory structure
    /(?:^|\s)([a-zA-Z0-9_\-/.]+\/[a-zA-Z0-9_\-/.]+\.[a-zA-Z0-9]+)/g,
  ];

  // Apply each pattern and collect results
  for (const pattern of patterns) {
    let match;
    // Reset pattern for each iteration
    pattern.lastIndex = 0;

    while ((match = pattern.exec(response)) !== null) {
      const foundPath = match[1].trim();

      // Skip if it's just a file extension or too short
      if (foundPath.length < 3 || /^\.\w+$/.test(foundPath)) {
        continue;
      }

      // Skip if it seems to be a URL or absolute Windows path with drive letter
      if (foundPath.startsWith("http") || /^[a-zA-Z]:/.test(foundPath)) {
        continue;
      }

      // If we have a project directory and the path is relative, make it absolute using Rust pathJoin
      const processedPath = projectDirectory
        ? await tauriFs.pathJoin(projectDirectory, foundPath)
        : foundPath;

      // Normalize the path and add if not already included
      const normalizedPath = await normalizePath(processedPath);
      if (!paths.includes(normalizedPath)) {
        paths.push(normalizedPath);
      }
    }
  }

  // Look for paths in specialized formats like bulleted or numbered lists
  if (paths.length === 0) {
    const lines = response.split("\n").map((line) => line.trim());

    for (const line of lines) {
      // Skip empty lines
      if (!line) continue;

      // Look for numbered lists (1. path/to/file.js)
      const numberedMatch = line.match(/^\d+\.\s*(.+)$/);
      if (
        numberedMatch &&
        numberedMatch[1].includes(".") &&
        !numberedMatch[1].includes(" ")
      ) {
        const extractedPath = numberedMatch[1].trim();
        const joinedPath = projectDirectory
          ? await tauriFs.pathJoin(projectDirectory, extractedPath)
          : extractedPath;
        paths.push(await normalizePath(joinedPath));
        continue;
      }

      // Look for bulleted lists (- path/to/file.js)
      const bulletMatch = line.match(/^[-*•]\s*(.+)$/);
      if (
        bulletMatch &&
        bulletMatch[1].includes(".") &&
        !bulletMatch[1].includes(" ")
      ) {
        const extractedPath = bulletMatch[1].trim();
        const joinedPath = projectDirectory
          ? await tauriFs.pathJoin(projectDirectory, extractedPath)
          : extractedPath;
        paths.push(await normalizePath(joinedPath));
      }
    }
  }

  // Return the deduplicated, normalized list of paths
  const normalizedPaths = await Promise.all(
    [...new Set(paths)].map((p) => normalizePath(p))
  );
  return [...new Set(normalizedPaths)];
}
