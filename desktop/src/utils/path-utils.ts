import * as tauriFs from "@/utils/tauri-fs";

/**
 * Validates if a string is a reasonable path candidate
 * More sophisticated than just checking for spaces - allows quoted paths or paths with reasonable space usage
 */
function isValidPathCandidate(pathStr: string): boolean {
  const trimmed = pathStr.trim();
  
  // Allow paths that are quoted (common in AI responses)
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return true;
  }
  
  // Allow paths without spaces (original behavior)
  if (!trimmed.includes(" ")) {
    return true;
  }
  
  // For paths with spaces, be more restrictive:
  // - Must have a reasonable file extension
  // - Should not have multiple consecutive spaces
  // - Should not start or end with space (already trimmed, but double-check)
  const hasReasonableExtension = /\.[a-zA-Z0-9]{1,10}$/.test(trimmed);
  const hasMultipleSpaces = /\s{2,}/.test(trimmed);
  const startsOrEndsWithSpace = trimmed !== trimmed.trim();
  
  return hasReasonableExtension && !hasMultipleSpaces && !startsOrEndsWithSpace;
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
 * 
 * This function handles various edge cases:
 * - Ensures both paths are normalized before comparison
 * - Handles trailing slash differences robustly
 * - Returns "." for paths that are the same as the base
 * - Gracefully handles paths that are not descendants of the base
 */
export async function makePathRelative(
  absolutePath: string,
  baseDirectory?: string
): Promise<string> {
  if (!absolutePath) return "";
  if (!baseDirectory) return absolutePath;

  const normalizedBase = await normalizePath(baseDirectory);
  const normalizedPath = await normalizePath(absolutePath);

  // Handle exact match case
  if (normalizedPath === normalizedBase) {
    return ".";
  }

  // Ensure base path has a trailing slash for consistent prefix checking
  // This prevents false positives like "/home/user" matching "/home/username"
  const baseWithTrailingSlash = normalizedBase.endsWith("/")
    ? normalizedBase
    : `${normalizedBase}/`;

  // Check if the path is a descendant of the base
  if (normalizedPath.startsWith(baseWithTrailingSlash)) {
    return normalizedPath.slice(baseWithTrailingSlash.length);
  }

  // Path is not a descendant of the base, return the original path
  return absolutePath;
}

/**
 * Creates a comparable path key for consistent file identification in UI state.
 * 
 * **Primary Use Case**: Creating consistent, comparable string keys for UI state management,
 * especially when backend normalization for every UI update might be too slow or when you 
 * need synchronous path comparison keys.
 * 
 * **When to Use**:
 * - UI state comparison keys (e.g., tracking selected files in React state)
 * - Display paths in lists where performance is critical
 * - Creating consistent path identifiers for UI caching and mapping
 * 
 * **When NOT to Use**:
 * - File system operations - use `tauriFs.normalizePath()` instead
 * - Paths sent to Rust backend - use backend-derived normalized paths
 * - Security-critical path validation - use backend normalization
 * 
 * This function performs basic string manipulation for normalization:
 * - Normalizes path separators to forward slashes
 * - Removes leading "./", "../", or "/" prefixes
 * - Handles multiple consecutive slashes
 * - Removes trailing slashes (except for root)
 * - Resolves basic "." and ".." components
 * 
 * **Important**: This is a lightweight, synchronous function for UI consistency.
 * For actual file system operations, always prefer `tauriFs.normalizePath()` 
 * or other backend-derived paths which handle complex paths, symlinks, and edge cases.
 */
export function createComparablePathKey(relativePath: string): string {
  if (!relativePath) return "";
  
  // Start with basic normalization
  let comparablePath = relativePath.trim().replace(/\\/g, "/");
  
  // Replace multiple consecutive slashes with single slash
  comparablePath = comparablePath.replace(/\/+/g, "/");
  
  // Remove leading "./", "../", or "/" prefixes
  while (comparablePath.startsWith("./") || comparablePath.startsWith("../") || comparablePath.startsWith("/")) {
    if (comparablePath.startsWith("../")) {
      comparablePath = comparablePath.substring(3);
    } else if (comparablePath.startsWith("./")) {
      comparablePath = comparablePath.substring(2);
    } else if (comparablePath.startsWith("/")) {
      comparablePath = comparablePath.substring(1);
    }
  }
  
  // Simple resolution of . and .. components
  const parts = comparablePath.split("/").filter(part => part !== "" && part !== ".");
  const resolvedParts: string[] = [];
  
  for (const part of parts) {
    if (part === "..") {
      // Pop the last part if it exists and isn't another ".."
      if (resolvedParts.length > 0 && resolvedParts[resolvedParts.length - 1] !== "..") {
        resolvedParts.pop();
      } else {
        // Keep the ".." if we can't resolve it
        resolvedParts.push(part);
      }
    } else {
      resolvedParts.push(part);
    }
  }
  
  comparablePath = resolvedParts.join("/");
  
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
    /^\s*(?:\d+\.\s*)?([a-zA-Z0-9_./~-]+[a-zA-Z0-9_~-]*(?:\.[a-zA-Z0-9_~-]+)*)\s*$/gm,

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

      // 1. Determine if foundPath is absolute using backend logic
      const isFoundPathAbsolute = await tauriFs.isAbsolute(foundPath);
      
      let processedPath: string;
      
      if (isFoundPathAbsolute) {
        // 2. If absolute:
        if (projectDirectory) {
          // If projectDirectory is provided, make it relative (this internally calls normalizePath)
          try {
            processedPath = await makePathRelative(foundPath, projectDirectory);
          } catch (e) {
            // Path is outside project, skip this path
            console.warn(`AI suggested path '${foundPath}' is outside project directory '${projectDirectory}' or invalid.`);
            continue;
          }
        } else {
          // If projectDirectory is not provided, normalize it (it will remain absolute)
          processedPath = await normalizePath(foundPath);
        }
      } else {
        // 3. If relative:
        if (projectDirectory) {
          // Join it with project directory, normalize, then make relative again
          const absPath = await tauriFs.pathJoin(projectDirectory, foundPath);
          const normalizedAbsPath = await normalizePath(absPath);
          processedPath = await makePathRelative(normalizedAbsPath, projectDirectory);
        } else {
          // If projectDirectory is not provided, normalize it (it will remain relative to CWD)
          processedPath = await normalizePath(foundPath);
        }
      }
      
      // 4. Apply final consistent formatting
      const finalComparablePath = createComparablePathKey(processedPath);

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
        numberedMatch[1].length > 3 &&
        isValidPathCandidate(numberedMatch[1])
      ) {
        let extractedPath = numberedMatch[1].trim();
        // Remove quotes if present
        if ((extractedPath.startsWith('"') && extractedPath.endsWith('"')) ||
            (extractedPath.startsWith("'") && extractedPath.endsWith("'"))) {
          extractedPath = extractedPath.slice(1, -1);
        }
        // Skip if it looks like a version number or URL
        if (!/^\d+\.\d+/.test(extractedPath) && !extractedPath.includes("http")) {
          // Use the same simplified logic for numbered list paths
          const isExtractedPathAbsolute = await tauriFs.isAbsolute(extractedPath);
          
          let processedPath: string;
          
          if (isExtractedPathAbsolute) {
            if (projectDirectory) {
              try {
                processedPath = await makePathRelative(extractedPath, projectDirectory);
              } catch (e) {
                console.warn(`AI suggested path '${extractedPath}' is outside project directory '${projectDirectory}' or invalid.`);
                continue;
              }
            } else {
              processedPath = await normalizePath(extractedPath);
            }
          } else {
            if (projectDirectory) {
              const absPath = await tauriFs.pathJoin(projectDirectory, extractedPath);
              const normalizedAbsPath = await normalizePath(absPath);
              processedPath = await makePathRelative(normalizedAbsPath, projectDirectory);
            } else {
              processedPath = await normalizePath(extractedPath);
            }
          }
          
          const finalComparablePath = createComparablePathKey(processedPath);
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
        isValidPathCandidate(bulletMatch[1])
      ) {
        let extractedPath = bulletMatch[1].trim();
        // Remove quotes if present
        if ((extractedPath.startsWith('"') && extractedPath.endsWith('"')) ||
            (extractedPath.startsWith("'") && extractedPath.endsWith("'"))) {
          extractedPath = extractedPath.slice(1, -1);
        }
        
        // Use the same simplified logic for bulleted list paths
        const isExtractedPathAbsolute = await tauriFs.isAbsolute(extractedPath);
        
        let processedPath: string;
        
        if (isExtractedPathAbsolute) {
          if (projectDirectory) {
            try {
              processedPath = await makePathRelative(extractedPath, projectDirectory);
            } catch (e) {
              console.warn(`AI suggested path '${extractedPath}' is outside project directory '${projectDirectory}' or invalid.`);
              continue;
            }
          } else {
            processedPath = await normalizePath(extractedPath);
          }
        } else {
          if (projectDirectory) {
            const absPath = await tauriFs.pathJoin(projectDirectory, extractedPath);
            const normalizedAbsPath = await normalizePath(absPath);
            processedPath = await makePathRelative(normalizedAbsPath, projectDirectory);
          } else {
            processedPath = await normalizePath(extractedPath);
          }
        }
        
        const finalComparablePath = createComparablePathKey(processedPath);
        if (!paths.includes(finalComparablePath)) {
          paths.push(finalComparablePath);
        }
      }
    }
  }

  // Return the deduplicated list of paths (already normalized and made project-relative)
  return [...new Set(paths)];
}
