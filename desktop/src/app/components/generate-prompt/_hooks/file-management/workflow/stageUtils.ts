import { BackgroundJob } from "@/types/session-types";
import { FilesMap as ProjectFilesMap } from "../use-project-file-list";
import { ensureProjectRelativePath } from "@/utils/path-utils";
import { BINARY_EXTENSIONS } from "@/utils/file-binary-utils";

/**
 * Extracts verified and unverified paths from a path finder job result.
 * Prioritizes metadata.pathFinderData over response content.
 * Ensures all returned paths are project-relative.
 */
export function extractPathsFromPathFinderJobResult(
  job: BackgroundJob | null | undefined
): { verified: string[]; unverified: string[] } {
  if (!job) {
    return { verified: [], unverified: [] };
  }

  let pathFinderData: any = null;

  // First, try to get data from metadata.pathFinderData
  if (job.metadata?.pathFinderData) {
    try {
      if (typeof job.metadata.pathFinderData === "string") {
        pathFinderData = JSON.parse(job.metadata.pathFinderData);
      } else {
        pathFinderData = job.metadata.pathFinderData;
      }
    } catch (error) {
      console.warn("Failed to parse pathFinderData from metadata:", error);
    }
  }

  // If we have structured path finder data, use it
  if (pathFinderData && typeof pathFinderData === "object") {
    const verified = Array.isArray(pathFinderData.paths) 
      ? pathFinderData.paths.map((path: string) => ensureProjectRelativePath(path)).filter(Boolean)
      : [];
    
    const unverified = Array.isArray(pathFinderData.unverifiedPaths)
      ? pathFinderData.unverifiedPaths.map((path: string) => ensureProjectRelativePath(path)).filter(Boolean)
      : [];

    return { verified, unverified };
  }

  // Fallback to parsing response content
  if (job.response && typeof job.response === "string") {
    const lines = job.response
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => ensureProjectRelativePath(line))
      .filter(Boolean);

    // For response parsing, we treat all paths as unverified since we don't have
    // structured data to distinguish between verified and unverified
    return { verified: [], unverified: lines };
  }

  return { verified: [], unverified: [] };
}

/**
 * Validates and normalizes paths against the project files map.
 * Returns only paths that exist in the project, are files (not directories),
 * and are not binary files.
 */
export async function validateAndNormalizePathsAgainstMap(
  pathsToValidate: string[],
  projectDirectory: string,
  rawFilesMap: ProjectFilesMap
): Promise<string[]> {
  if (!pathsToValidate.length || !projectDirectory || !rawFilesMap) {
    return [];
  }

  const validPaths: string[] = [];
  const seenPaths = new Set<string>();

  for (const path of pathsToValidate) {
    if (!path) continue;

    // Normalize the path to project-relative format
    const normalizedPath = ensureProjectRelativePath(path);
    
    // Skip if we've already processed this path
    if (seenPaths.has(normalizedPath)) {
      continue;
    }
    seenPaths.add(normalizedPath);

    // Check if this path exists in the raw files map
    const fileInfo = rawFilesMap[normalizedPath];
    if (!fileInfo) {
      continue; // Path doesn't exist in project
    }

    // Check if it's a file (has a size property or doesn't end with '/')
    // If it's a directory, skip it
    if (normalizedPath.endsWith('/') || normalizedPath.endsWith('\\')) {
      continue; // It's a directory
    }

    // Check if it's a binary file by extension
    const extension = normalizedPath.toLowerCase().split('.').pop();
    if (extension && BINARY_EXTENSIONS.has(`.${extension}`)) {
      continue; // Skip binary files
    }

    // If we made it here, the path is valid
    validPaths.push(normalizedPath);
  }

  return validPaths;
}