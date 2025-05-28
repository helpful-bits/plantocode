import { RawRegexPatterns } from "./workflowTypes";
import { FilesMap as ProjectFilesMap } from "../use-project-file-list";
import { ensureProjectRelativePath } from "@/utils/path-utils";

export function performLocalFiltering(
  patterns: RawRegexPatterns | null,
  rawFilesMap: ProjectFilesMap
): string[] {
  if (patterns === null) {
    return [];
  }

  const filePaths = Object.keys(rawFilesMap);
  const matchingPaths: string[] = [];

  for (const filePath of filePaths) {
    const projectRelativePath = ensureProjectRelativePath(filePath);
    let isMatch = false;

    // Apply positive title regex
    if (patterns.titleRegex) {
      try {
        const regex = new RegExp(patterns.titleRegex, 'i');
        isMatch = regex.test(projectRelativePath);
      } catch {
        // Fallback to string includes for invalid regex
        isMatch = projectRelativePath.toLowerCase().includes(patterns.titleRegex.toLowerCase());
      }
    } else {
      // If no positive regex, include all files by default
      isMatch = true;
    }

    // Apply negative title regex (exclusion)
    if (isMatch && patterns.negativeTitleRegex) {
      try {
        const negativeRegex = new RegExp(patterns.negativeTitleRegex, 'i');
        if (negativeRegex.test(projectRelativePath)) {
          isMatch = false;
        }
      } catch {
        // Fallback to string includes for invalid regex
        if (projectRelativePath.toLowerCase().includes(patterns.negativeTitleRegex.toLowerCase())) {
          isMatch = false;
        }
      }
    }

    if (isMatch) {
      matchingPaths.push(projectRelativePath);
    }
  }

  return matchingPaths;
}