"use client";

import { useState, useCallback } from "react";

import { readExternalFileAction } from "@/actions";
import { makePathRelative } from "@/utils/path-utils";

import { type FilesMap, type FileInfo } from "./file-management/use-project-file-list";
import { logger } from "./logger";

interface UseFileContentLoaderProps {
  allFilesMap: FilesMap;
  fileContentsMap: Record<string, string>;
  projectDirectory: string;
  pastedPaths: string;
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
  pastedPaths,
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

      const hasPastedPaths = pastedPaths.trim().length > 0;
      const isAnyFileIncludedFromBrowser = Object.values(
        allFilesMap || {}
      ).some((f: FileInfo) => f.included && !f.forceExcluded);

      if (hasPastedPaths) {
        logger.debug("FileContentLoader", "Processing pasted paths");

        // Create a normalized map for better file path matching
        const normalizedFileContentsMap: Record<string, string> = {};

        for (const key of Object.keys(loadedFileContents)) {
          const normalizedKey = await makePathRelative(key, projectDirectory);
          normalizedFileContentsMap[normalizedKey] = key; // Store the original key
        }

        // Parse the pasted paths
        const rawPastedPaths = pastedPaths
          .split("\n")
          .map((p) => p.trim())
          .filter((p) => !!p && !p.startsWith("#"));

        logger.debug(
          "FileContentLoader",
          `Processing ${rawPastedPaths.length} pasted paths`
        );
        const projectFilePaths = new Set(Object.keys(loadedFileContents || {}));

        for (const filePath of rawPastedPaths) {
          // Try to normalize the path if it's not an absolute path
          const normalizedPath = await makePathRelative(
            filePath,
            projectDirectory
          );

          // Check if the path exists in our normalized map
          if (normalizedFileContentsMap[normalizedPath]) {
            // Use the original path from the map
            const originalPath = normalizedFileContentsMap[normalizedPath];
            selectedFiles.push(originalPath);
            logger.debug(
              "FileContentLoader",
              `Found match for normalized path: ${normalizedPath} -> ${originalPath}`
            );
          } else if (projectFilePaths.has(filePath)) {
            // Original path lookup
            if (loadedFileContents[filePath] !== undefined) {
              selectedFiles.push(filePath);
              logger.debug(
                "FileContentLoader",
                `Found match for direct path: ${filePath}`
              );
            } else {
              warningMessages.push(
                `Could not find content for project path "${filePath}".`
              );
              logger.warn(`Content missing for project path: ${filePath}`);
            }
          } else {
            // Path is potentially external
            logger.debug(
              "FileContentLoader",
              `Attempting to read external path: ${filePath}`
            );
            const externalFileResult = await readExternalFileAction(filePath);

            // Process the external file result
            if (externalFileResult.isSuccess && externalFileResult.data) {
              // Merge external content into our temporary map
              const processedData = Object.entries(
                externalFileResult.data
              ).reduce(
                (acc, [key, value]) => {
                  acc[key] = value;
                  return acc;
                },
                {} as Record<string, string>
              );

              loadedFileContents = { ...loadedFileContents, ...processedData };
              // Add the path
              const addedPath = Object.keys(externalFileResult.data)[0];
              selectedFiles.push(addedPath);
              logger.debug(
                "FileContentLoader",
                `Successfully read external path: ${filePath} -> ${addedPath}`
              );
            } else {
              warningMessages.push(
                `Could not read external path "${filePath}": ${externalFileResult.message}`
              );
              logger.warn(
                "FileContentLoader",
                `Failed to read external file ${filePath}: ${externalFileResult.message}`
              );
            }
          }
        }

        if (selectedFiles.length === 0 && rawPastedPaths.length > 0) {
          setError(
            "None of the pasted paths could be read or found. Check paths and permissions."
          );
          if (warningMessages.length > 0) setWarnings(warningMessages);
          setIsLoading(false);
          return;
        }
      } else if (isAnyFileIncludedFromBrowser) {
        logger.debug("FileContentLoader", "Using browser-selected files");
        // No pasted paths, use files selected in the browser from the state
        const selectedPaths = new Set(
          Object.values(allFilesMap)
            .filter((f: FileInfo) => f.included && !f.forceExcluded)
            .map((f: FileInfo) => f.path)
        );

        logger.debug(
          "FileContentLoader",
          `Found ${selectedPaths.size} selected paths in browser`
        );

        // Create a map of normalized paths to original paths for better matching
        const normalizedToOriginal: Record<string, string> = {};

        for (const originalPath of Object.keys(loadedFileContents)) {
          const normalizedPath = await makePathRelative(
            originalPath,
            projectDirectory
          );
          normalizedToOriginal[normalizedPath] = originalPath;
        }

        selectedFiles = Object.keys(loadedFileContents).filter(
          (path) =>
            selectedPaths.has(path) && loadedFileContents[path] !== undefined
        );

        logger.debug(
          "FileContentLoader",
          `After filtering, using ${selectedFiles.length} files from browser selection`
        );
      } else {
        // Neither pasted paths nor browser selection
        logger.warn(
          "FileContentLoader",
          "No files selected - neither pasted paths nor browser selection found"
        );
        setError(
          "Please include at least one file using the file browser or paste file paths."
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
    } catch (err) {
      logger.error("FileContentLoader", "Error loading file contents:", err);
      setError("Failed to load file contents");
    } finally {
      setIsLoading(false);
    }
  }, [projectDirectory, pastedPaths, allFilesMap, fileContentsMap]);

  return {
    filesToUse,
    currentFileContents,
    isLoading,
    error,
    warnings,
    loadFileContents,
  };
}