import * as tauriFs from "@/utils/tauri-fs";


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
    // Paths on their own lines or with numbers (improved to handle more file extensions)
    /^\s*(?:\d+\.\s*)?([^:\n\r\s]+\.[a-zA-Z0-9]+)\s*$/gm,

    // Paths in markdown lists (improved whitespace handling)
    /^\s*[-*•]\s+([^:\n\r\s]+\.[a-zA-Z0-9]+)\s*$/gm,

    // Paths in markdown code blocks (improved to handle inline code)
    /`([^`\n\r]+\.[a-zA-Z0-9]+)`/g,

    // Paths in quotes (common in AI responses)
    /["']([^"'\n\r]+\.[a-zA-Z0-9]+)["']/g,

    // Paths with relative prefixes (./something.js, ../something.js)
    /(?:^|\s)(\.{1,2}\/[^\s,:"'<>|]+\.[a-zA-Z0-9]+)/g,

    // More complex paths with directory structure (improved character set)
    /(?:^|\s)([a-zA-Z0-9_\-/.@]+\/[a-zA-Z0-9_\-/.@]+\.[a-zA-Z0-9]+)/g,

    // Paths that start with common directory names
    /(?:^|\s)((?:src|lib|dist|build|public|assets|components|utils|hooks|pages|app)\/[^\s,:"'<>|]+\.[a-zA-Z0-9]+)/gi,
  ];

  // Apply each pattern and collect results
  for (const pattern of patterns) {
    let match;
    // Reset pattern for each iteration
    pattern.lastIndex = 0;

    while ((match = pattern.exec(response)) !== null) {
      const foundPath = match[1].trim();

      // Skip if it's just a file extension, too short, or contains invalid characters
      if (foundPath.length < 3 || /^\.\w+$/.test(foundPath) || /[<>|"]/.test(foundPath)) {
        continue;
      }

      // Skip if it seems to be a URL, email, or absolute Windows path with drive letter
      if (foundPath.startsWith("http") || foundPath.includes("@") || /^[a-zA-Z]:/.test(foundPath)) {
        continue;
      }

      // Skip common false positives (version numbers, domains, etc.)
      if (/^\d+\.\d+\.\d+/.test(foundPath) || foundPath.includes("www.") || foundPath.includes(".com")) {
        continue;
      }

      let absolutePathToConsider: string;
      // Check if foundPath is absolute (simple platform-agnostic check)
      const isFoundPathAbsolute = foundPath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(foundPath);

      if (isFoundPathAbsolute) {
          absolutePathToConsider = await normalizePath(foundPath);
      } else if (projectDirectory) {
          // Join relative path with project directory
          const joinedPath = await tauriFs.pathJoin(projectDirectory, foundPath);
          absolutePathToConsider = await normalizePath(joinedPath);
      } else {
          // No project directory, normalize foundPath as is (might be relative to CWD or invalid)
          absolutePathToConsider = await normalizePath(foundPath);
      }

      // Attempt to make it relative to the project directory
      let projectRelativePath: string;
      if (projectDirectory) {
          try {
              const normalizedProjectDir = await normalizePath(projectDirectory); // Ensure base is also normalized
              projectRelativePath = await makePathRelative(absolutePathToConsider, normalizedProjectDir);
          } catch (e) {
              // Path is likely outside the project or cannot be made relative.
              console.warn(`AI suggested path '${foundPath}' (resolved to '${absolutePathToConsider}') is outside project directory '${projectDirectory}' or invalid.`);
              continue; // Skip this path
          }
      } else {
          // No project directory to make it relative to; use the normalized (potentially absolute) path.
          // This case should be rare if projectDirectory is usually available.
          projectRelativePath = absolutePathToConsider;
      }
      
      // Ensure consistent relative path format (e.g., no leading './') using the existing utility
      const finalComparablePath = ensureProjectRelativePath(projectRelativePath);

      if (!paths.includes(finalComparablePath)) {
        paths.push(finalComparablePath);
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
        !numberedMatch[1].includes(" ") &&
        numberedMatch[1].length > 3
      ) {
        const extractedPath = numberedMatch[1].trim();
        // Skip if it looks like a version number or URL
        if (!/^\d+\.\d+/.test(extractedPath) && !extractedPath.includes("http")) {
          let absolutePathToConsider: string;
          const isExtractedPathAbsolute = extractedPath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(extractedPath);

          if (isExtractedPathAbsolute) {
              absolutePathToConsider = await normalizePath(extractedPath);
          } else if (projectDirectory) {
              const joinedPath = await tauriFs.pathJoin(projectDirectory, extractedPath);
              absolutePathToConsider = await normalizePath(joinedPath);
          } else {
              absolutePathToConsider = await normalizePath(extractedPath);
          }

          let projectRelativePath: string;
          if (projectDirectory) {
              try {
                  const normalizedProjectDir = await normalizePath(projectDirectory);
                  projectRelativePath = await makePathRelative(absolutePathToConsider, normalizedProjectDir);
              } catch (e) {
                  console.warn(`AI suggested path '${extractedPath}' (resolved to '${absolutePathToConsider}') is outside project directory '${projectDirectory}' or invalid.`);
                  continue;
              }
          } else {
              projectRelativePath = absolutePathToConsider;
          }
          
          const finalComparablePath = ensureProjectRelativePath(projectRelativePath);
          if (!paths.includes(finalComparablePath)) {
            paths.push(finalComparablePath);
          }
        }
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
        let absolutePathToConsider: string;
        const isExtractedPathAbsolute = extractedPath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(extractedPath);

        if (isExtractedPathAbsolute) {
            absolutePathToConsider = await normalizePath(extractedPath);
        } else if (projectDirectory) {
            const joinedPath = await tauriFs.pathJoin(projectDirectory, extractedPath);
            absolutePathToConsider = await normalizePath(joinedPath);
        } else {
            absolutePathToConsider = await normalizePath(extractedPath);
        }

        let projectRelativePath: string;
        if (projectDirectory) {
            try {
                const normalizedProjectDir = await normalizePath(projectDirectory);
                projectRelativePath = await makePathRelative(absolutePathToConsider, normalizedProjectDir);
            } catch (e) {
                console.warn(`AI suggested path '${extractedPath}' (resolved to '${absolutePathToConsider}') is outside project directory '${projectDirectory}' or invalid.`);
                continue;
            }
        } else {
            projectRelativePath = absolutePathToConsider;
        }
        
        const finalComparablePath = ensureProjectRelativePath(projectRelativePath);
        if (!paths.includes(finalComparablePath)) {
          paths.push(finalComparablePath);
        }
      }
    }
  }

  // Return the deduplicated list of paths (already normalized and made project-relative)
  return [...new Set(paths)];
}
