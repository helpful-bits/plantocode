"use client";

import { useMemo } from "react";

import { type FilesMap } from "./use-project-file-list";

import type { FileInfo } from "@/types";

interface RegexPatterns {
  titleRegex: string;
  contentRegex: string;
  negativeTitleRegex: string;
  negativeContentRegex: string;
}

interface UseFileFilteringProps {
  managedFilesMap: FilesMap;
  fileContentsMap: { [key: string]: string };
  searchTerm: string;
  filterMode: "all" | "selected" | "regex";
  regexPatterns: RegexPatterns;
}

/**
 * Hook for filtering files based on search term, regex, and selection state
 */
export function useFileFiltering({
  managedFilesMap,
  fileContentsMap,
  searchTerm,
  filterMode,
  regexPatterns,
}: UseFileFilteringProps) {
  // Memoize regex objects to prevent unnecessary recreation
  const compiledRegexObjects = useMemo(() => {
    const titleRegexTrimmed = regexPatterns.titleRegex.trim();
    const contentRegexTrimmed = regexPatterns.contentRegex.trim();
    const negativeTitleRegexTrimmed = regexPatterns.negativeTitleRegex.trim();
    const negativeContentRegexTrimmed = regexPatterns.negativeContentRegex.trim();

    // Compile title regex with error handling
    let titleRegexObj: RegExp | null = null;
    if (titleRegexTrimmed) {
      try {
        titleRegexObj = new RegExp(titleRegexTrimmed, "i");
      } catch (e) {
        console.warn("Invalid title regex in useFileFiltering:", e);
        titleRegexObj = null;
      }
    }

    // Compile content regex with error handling
    let contentRegexObj: RegExp | null = null;
    if (contentRegexTrimmed) {
      try {
        contentRegexObj = new RegExp(contentRegexTrimmed, "im");
      } catch (e) {
        console.warn("Invalid content regex in useFileFiltering:", e);
        contentRegexObj = null;
      }
    }

    // Compile negative title regex with error handling
    let negativeTitleRegexObj: RegExp | null = null;
    if (negativeTitleRegexTrimmed) {
      try {
        negativeTitleRegexObj = new RegExp(negativeTitleRegexTrimmed, "i");
      } catch (e) {
        console.warn("Invalid negative title regex in useFileFiltering:", e);
        negativeTitleRegexObj = null;
      }
    }

    // Compile negative content regex with error handling
    let negativeContentRegexObj: RegExp | null = null;
    if (negativeContentRegexTrimmed) {
      try {
        negativeContentRegexObj = new RegExp(negativeContentRegexTrimmed, "im");
      } catch (e) {
        console.warn("Invalid negative content regex in useFileFiltering:", e);
        negativeContentRegexObj = null;
      }
    }

    return {
      titleRegexObj,
      contentRegexObj,
      negativeTitleRegexObj,
      negativeContentRegexObj,
      titleRegexTrimmed,
      contentRegexTrimmed,
      negativeTitleRegexTrimmed,
      negativeContentRegexTrimmed
    };
  }, [
    regexPatterns.titleRegex,
    regexPatterns.contentRegex,
    regexPatterns.negativeTitleRegex,
    regexPatterns.negativeContentRegex
  ]);

  // Extract the filtering logic from FileBrowser component
  const filteredFiles = useMemo(() => {
    // Skip filtering if files are empty
    if (!managedFilesMap || Object.keys(managedFilesMap).length === 0) {
      return [];
    }

    // Start with all files from the managedFilesMap
    let filteredFilesInLoop: FileInfo[] = Object.values(managedFilesMap);

    // --- 1. FIRST, Apply filter mode logic ---
    if (filterMode === "selected") {
      // Show only files that are included and not force excluded
      filteredFilesInLoop = filteredFilesInLoop.filter(
        (file) => file.included && !file.forceExcluded
      );
    }

    // --- 2. SECOND, Filter by Search Term ---
    const lowerSearchTerm = searchTerm.toLowerCase();
    if (lowerSearchTerm) {
      filteredFilesInLoop = filteredFilesInLoop.filter((file) => {
        // First try searching in the path directly (most visible to users)
        if (file.path.toLowerCase().includes(lowerSearchTerm)) {
          return true;
        }

        // If not found in path, try in comparable path as fallback
        return file.comparablePath
          ? file.comparablePath.toLowerCase().includes(lowerSearchTerm)
          : false;
      });
    }

    // --- 3. THIRD, Apply Regex Filtering (if filter mode is 'regex') ---
    if (filterMode === "regex") {
      const {
        titleRegexObj,
        contentRegexObj,
        negativeTitleRegexObj,
        negativeContentRegexObj,
        titleRegexTrimmed,
        contentRegexTrimmed,
        negativeTitleRegexTrimmed,
        negativeContentRegexTrimmed
      } = compiledRegexObjects;

      const hasFileContents = Object.keys(fileContentsMap).length > 0;

      // Apply positive title regex filter
      if (titleRegexObj && titleRegexTrimmed) {
        filteredFilesInLoop = filteredFilesInLoop.filter((file) => {
          // Use comparablePath for matching if available
          const pathToTest = file.comparablePath || file.path;
          return titleRegexObj.test(pathToTest);
        });
      }

      // Apply positive content regex filter
      if (contentRegexObj && contentRegexTrimmed && hasFileContents) {
        filteredFilesInLoop = filteredFilesInLoop.filter((file) => {
          const pathToTest = file.comparablePath || file.path;

          // Get content using comparablePath first, then fallback to path
          const content = fileContentsMap[pathToTest];

          // If content is available and matches the regex, keep the file
          if (typeof content === "string") {
            return contentRegexObj.test(content);
          }

          // If content isn't loaded yet, exclude the file
          // This is a design decision - we exclude files without content when filtering by content
          return false;
        });
      }

      // Apply negative title regex filter (exclude matches)
      if (negativeTitleRegexObj && negativeTitleRegexTrimmed) {
        filteredFilesInLoop = filteredFilesInLoop.filter((file) => {
          // Use comparablePath for matching if available
          const pathToTest = file.comparablePath || file.path;
          return !negativeTitleRegexObj.test(pathToTest);
        });
      }

      // Apply negative content regex filter (exclude matches)
      if (
        negativeContentRegexObj &&
        negativeContentRegexTrimmed &&
        hasFileContents
      ) {
        filteredFilesInLoop = filteredFilesInLoop.filter((file) => {
          const pathToTest = file.comparablePath || file.path;

          // Get content using comparablePath first, then fallback to path
          const content = fileContentsMap[pathToTest];

          // Only exclude if content is available and matches
          if (typeof content === "string") {
            return !negativeContentRegexObj.test(content);
          }

          // If content isn't loaded yet, keep the file (don't exclude it based on unknown content)
          return true;
        });
      }
    }

    return filteredFilesInLoop;
  }, [
    managedFilesMap,
    searchTerm,
    filterMode,
    compiledRegexObjects,
    fileContentsMap,
  ]);

  return {
    filteredFiles,
  };
}
