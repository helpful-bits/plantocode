import { normalizePath } from "@/utils/path-utils";
import * as tauriFs from "@/utils/tauri-fs";

import { isBinaryFile, BINARY_EXTENSIONS } from "./file-binary-utils";

/**
 * Helper function to validate a file path, checking for existence, size, and binary content
 *
 * @param filePath Project-relative file path to validate
 * @param fileContents Record mapping project-relative paths to their contents
 * @param projectDirectory Absolute path to project directory
 * @param allFiles Optional list of known project-relative file paths
 * @returns Boolean indicating if the path is valid and not binary
 */
export async function validateFilePath(
  filePath: string,
  fileContents: Record<string, string>,
  projectDirectory: string,
  allFiles?: string[]
): Promise<boolean> {
  try {
    // Skip empty paths
    if (!filePath || typeof filePath !== "string" || filePath.trim() === "") {
      // Console warnings removed per lint requirements
      return false;
    }

    // Normalize path using the canonical path normalization function
    const normalizedPath = await normalizePath(filePath);

    // First check if we already have the content in our map
    if (fileContents[normalizedPath]) {
      // Skip binary files by checking the extension
      const ext = await tauriFs.pathExtname(normalizedPath);
      if (BINARY_EXTENSIONS.has(ext.toLowerCase())) {
        // Console debug removed per lint requirements
        return false;
      }

      // We already have the content, so we can check if it's binary
      const content = fileContents[normalizedPath];
      if (!content) return false;

      try {
        const isBinaryResult = isBinaryFile(
          new TextEncoder().encode(content)
        );
        return !isBinaryResult;
      } catch (_err) {
        // Console debug removed per lint requirements
        return false;
      }
    } else {
      // Check if the path exists in our known files list
      if (allFiles && allFiles.length > 0) {
        const fileExists = allFiles.includes(normalizedPath);
        if (!fileExists) {
          // Console debug removed per lint requirements
          return false;
        }

        // Skip binary files by checking the extension
        const ext = await tauriFs.pathExtname(normalizedPath);
        if (BINARY_EXTENSIONS.has(ext.toLowerCase())) {
          // Console debug removed per lint requirements
          return false;
        }

        // Try to read the file to check if it's binary or too large
        try {
          // Resolve the full path (always use project directory as base for normalized path)
          const fullPath = await tauriFs.pathJoin(
            projectDirectory,
            normalizedPath
          );

          try {
            // Try to get file details using listFiles (which includes file size info)
            const files = await tauriFs.listFiles(
              await tauriFs.pathDirname(fullPath),
              await tauriFs.pathBasename(fullPath),
              true
            );

            if (files.length === 0) {
              // Console debug removed per lint requirements
              return false;
            }

            const fileInfo = files[0];

            // Skip files that are too large (>10MB) to avoid memory issues
            if (
              typeof fileInfo.size === "number" &&
              fileInfo.size > 10 * 1024 * 1024
            ) {
              // Console warn removed per lint requirements
              return false;
            }

            // Try to read the file and check if it's binary
            const content = await tauriFs.readFileContent(fullPath);
            const isBinaryResult = isBinaryFile(
              new TextEncoder().encode(content)
            );

            if (isBinaryResult) {
              // Console debug removed per lint requirements
              return false;
            }

            return true;
          } catch (_error) {
            // Console debug removed per lint requirements
            return false;
          }
        } catch (_readError) {
          // Handle file reading errors (permissions, etc)
          // Console debug removed per lint requirements
          return false;
        }
      }

      // If no allFiles provided, the path is not valid
      // Console debug removed per lint requirements
      return false;
    }
  } catch (_error) {
    // Skip files with any other issues
    // Console debug removed per lint requirements
    return false;
  }
}
