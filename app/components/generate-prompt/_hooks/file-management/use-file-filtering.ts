"use client";

import { useMemo } from "react";
import { FileInfo } from "@/types";
import { FilesMap } from "./use-project-file-list";

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
  filterMode: 'all' | 'selected' | 'regex';
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
  regexPatterns
}: UseFileFilteringProps) {
  // Extract the filtering logic from FileBrowser component
  const {
    filteredFiles,
    titleRegexError,
    contentRegexError,
    negativeTitleRegexError,
    negativeContentRegexError
  } = useMemo(() => {
    // Default values
    let titleRegexError = null;
    let contentRegexError = null;
    let negativeTitleRegexError = null;
    let negativeContentRegexError = null;

    // Skip filtering if files are empty
    if (!managedFilesMap || Object.keys(managedFilesMap).length === 0) {
      return {
        filteredFiles: [],
        titleRegexError,
        contentRegexError,
        negativeTitleRegexError,
        negativeContentRegexError
      };
    }

    // Start with all files from the managedFilesMap
    let filteredFiles: FileInfo[] = Object.values(managedFilesMap);

    // --- 1. FIRST, Apply filter mode logic ---
    if (filterMode === 'selected') {
      // Show only files that are included and not force excluded
      filteredFiles = filteredFiles.filter(file => file.included && !file.forceExcluded);
    }

    // --- 2. SECOND, Filter by Search Term ---
    const lowerSearchTerm = searchTerm.toLowerCase();
    if (lowerSearchTerm) {
      filteredFiles = filteredFiles.filter(file => {
        // First try searching in the path directly (most visible to users)
        if (file.path.toLowerCase().includes(lowerSearchTerm)) {
          return true;
        }

        // If not found in path, try in comparable path as fallback
        return file.comparablePath ?
          file.comparablePath.toLowerCase().includes(lowerSearchTerm) :
          false;
      });
    }

    // --- 3. THIRD, Apply Regex Filtering (if filter mode is 'regex') ---
    if (filterMode === 'regex') {
      // Process positive regex patterns
      const titleRegexTrimmed = regexPatterns.titleRegex.trim();
      const contentRegexTrimmed = regexPatterns.contentRegex.trim();

      // Compile title regex with error handling
      let titleRegexObj: RegExp | null = null;
      if (titleRegexTrimmed) {
        try {
          titleRegexObj = new RegExp(titleRegexTrimmed, 'i'); // Use case-insensitive flag
          titleRegexError = null; // Clear error if regex is valid
        } catch (e) {
          titleRegexError = e instanceof Error ? e.message : "Invalid title regex";
          console.error("Title Regex Error:", e);
        }
      }

      // Compile content regex with error handling
      let contentRegexObj: RegExp | null = null;
      if (contentRegexTrimmed) {
        try {
          contentRegexObj = new RegExp(contentRegexTrimmed, 'im'); // Use multiline and case-insensitive flags
          contentRegexError = null; // Clear error if regex is valid
        } catch (e) {
          contentRegexError = e instanceof Error ? e.message : "Invalid content regex";
          console.error("Content Regex Error:", e);
        }
      }

      // Compile negative title regex with error handling
      const negativeTitleRegexTrimmed = regexPatterns.negativeTitleRegex.trim();
      let negativeTitleRegexObj: RegExp | null = null;
      if (negativeTitleRegexTrimmed) {
        try {
          negativeTitleRegexObj = new RegExp(negativeTitleRegexTrimmed, 'i'); // Use case-insensitive flag
          negativeTitleRegexError = null; // Clear error if regex is valid
        } catch (e) {
          negativeTitleRegexError = e instanceof Error ? e.message : "Invalid negative title regex";
          console.error("Negative Title Regex Error:", e);
        }
      }

      // Compile negative content regex with error handling
      const negativeContentRegexTrimmed = regexPatterns.negativeContentRegex.trim();
      let negativeContentRegexObj: RegExp | null = null;
      if (negativeContentRegexTrimmed) {
        try {
          negativeContentRegexObj = new RegExp(negativeContentRegexTrimmed, 'im'); // Use multiline and case-insensitive flags
          negativeContentRegexError = null; // Clear error if regex is valid
        } catch (e) {
          negativeContentRegexError = e instanceof Error ? e.message : "Invalid negative content regex";
          console.error("Negative Content Regex Error:", e);
        }
      }

      const hasFileContents = Object.keys(fileContentsMap).length > 0;

      // Apply positive title regex filter
      if (titleRegexObj && titleRegexTrimmed) {
        filteredFiles = filteredFiles.filter(file => {
          // Use comparablePath for matching if available
          const pathToTest = file.comparablePath || file.path;
          return titleRegexObj!.test(pathToTest);
        });
      }

      // Apply positive content regex filter
      if (contentRegexObj && contentRegexTrimmed && hasFileContents) {
        filteredFiles = filteredFiles.filter(file => {
          const pathToTest = file.comparablePath || file.path;

          // Get content using comparablePath first, then fallback to path
          const content = fileContentsMap[pathToTest];

          // If content is available and matches the regex, keep the file
          if (typeof content === 'string') {
            return contentRegexObj!.test(content);
          }

          // If content isn't loaded yet, exclude the file
          // This is a design decision - we exclude files without content when filtering by content
          return false;
        });
      }

      // Apply negative title regex filter (exclude matches)
      if (negativeTitleRegexObj && negativeTitleRegexTrimmed) {
        filteredFiles = filteredFiles.filter(file => {
          // Use comparablePath for matching if available
          const pathToTest = file.comparablePath || file.path;
          return !negativeTitleRegexObj!.test(pathToTest);
        });
      }

      // Apply negative content regex filter (exclude matches)
      if (negativeContentRegexObj && negativeContentRegexTrimmed && hasFileContents) {
        filteredFiles = filteredFiles.filter(file => {
          const pathToTest = file.comparablePath || file.path;

          // Get content using comparablePath first, then fallback to path
          const content = fileContentsMap[pathToTest];

          // Only exclude if content is available and matches
          if (typeof content === 'string') {
            return !negativeContentRegexObj!.test(content);
          }

          // If content isn't loaded yet, keep the file (don't exclude it based on unknown content)
          return true;
        });
      }
    }

    return {
      filteredFiles,
      titleRegexError,
      contentRegexError,
      negativeTitleRegexError,
      negativeContentRegexError
    };

  }, [
    managedFilesMap,
    searchTerm,
    filterMode,
    regexPatterns.titleRegex,
    regexPatterns.contentRegex,
    regexPatterns.negativeTitleRegex,
    regexPatterns.negativeContentRegex,
    fileContentsMap
  ]);

  return {
    filteredFiles,
    titleRegexError,
    contentRegexError,
    negativeTitleRegexError,
    negativeContentRegexError
  };
}