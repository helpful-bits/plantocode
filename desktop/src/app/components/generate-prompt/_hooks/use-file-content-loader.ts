"use client";

import { useState, useCallback } from "react";

import { type FilesMap, type FileInfo } from "./file-management/use-project-file-list";

interface UseFileContentLoaderProps {
  allFilesMap: FilesMap;
  fileContentsMap: Record<string, string>;
  projectDirectory: string;
}

interface UseFileContentLoaderResult {
  filesToUse: string[];
  currentFileContents: Record<string, string>;
  isLoading: boolean;
  error: string;
  warnings: string[];
  loadFileContents: () => Promise<void>;
}

export function useFileContentLoader({
  allFilesMap,
  fileContentsMap,
  projectDirectory,
}: UseFileContentLoaderProps): UseFileContentLoaderResult {
  const [filesToUse, setFilesToUse] = useState<string[]>([]);
  const [currentFileContents, setCurrentFileContents] = useState<
    Record<string, string>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const loadFileContents = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setWarnings([]);
    setFilesToUse([]);

    try {
      let loadedFileContents: Record<string, string> = {};
      let selectedFiles: string[] = [];
      const warningMessages: string[] = [];

      if (!projectDirectory) {
        setError("No project directory specified");
        setIsLoading(false);
        return;
      }

      // Start with the provided file contents map
      if (Object.keys(fileContentsMap).length > 0) {
        loadedFileContents = { ...fileContentsMap };
      } else {
        setError(
          "No file contents available. Please ensure files are loaded in the browser."
        );
        setIsLoading(false);
        return;
      }

      const isAnyFileIncludedFromBrowser = Object.values(
        allFilesMap || {}
      ).some((f: FileInfo) => f.included && !f.forceExcluded);

      if (isAnyFileIncludedFromBrowser) {
        // Use files selected in the browser from the state
        // Use original paths from allFilesMap for consistent file content lookups
        for (const pathInAllFilesMap in allFilesMap) {
          if (Object.prototype.hasOwnProperty.call(allFilesMap, pathInAllFilesMap)) {
            const fileInfo = allFilesMap[pathInAllFilesMap] as FileInfo;
            if (fileInfo.included && !fileInfo.forceExcluded) {
              // pathInAllFilesMap is the original path, use it for lookup and storage
              if (fileContentsMap[pathInAllFilesMap] !== undefined) {
                loadedFileContents[pathInAllFilesMap] = fileContentsMap[pathInAllFilesMap];
                selectedFiles.push(pathInAllFilesMap);
              } else {
                warningMessages.push(`Content for selected file ${pathInAllFilesMap} not found in cache.`);
              }
            }
          }
        }
      } else {
        // No browser selection
        setError(
          "Please include at least one file using the file browser."
        );
        setIsLoading(false);
        return;
      }

      // Set the final state
      setFilesToUse(selectedFiles);
      setCurrentFileContents(loadedFileContents);

      if (warningMessages.length > 0) {
        setWarnings(warningMessages);
      }
    } catch (_err) {
      setError("Failed to load file contents");
    } finally {
      setIsLoading(false);
    }
  }, [projectDirectory, allFilesMap, fileContentsMap]);

  return {
    filesToUse,
    currentFileContents,
    isLoading,
    error,
    warnings,
    loadFileContents,
  };
}