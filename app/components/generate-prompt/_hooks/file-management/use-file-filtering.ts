"use client";

import { useMemo } from "react";
import { FileInfo } from "@/types";
import { FilesMap } from "./use-project-file-list";

interface RegexState {
  titleRegex: string;
  contentRegex: string;
  negativeTitleRegex: string;
  negativeContentRegex: string;
  isRegexActive: boolean;
}

interface UseFileFilteringProps {
  managedFilesMap: FilesMap;
  fileContentsMap: { [key: string]: string };
  searchTerm: string;
  showOnlySelected: boolean;
  regexState: RegexState;
}

/**
 * Hook for filtering files based on search term, regex, and selection state
 */
export function useFileFiltering({
  managedFilesMap,
  fileContentsMap,
  searchTerm,
  showOnlySelected,
  regexState
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
    
    let filesToFilter = Object.values(managedFilesMap);
    let filteredFiles: FileInfo[] = [];

    // --- 1. Filter by Search Term ---
    const lowerSearchTerm = searchTerm.toLowerCase();
    if (lowerSearchTerm) {
      filesToFilter = filesToFilter.filter(file =>
        file.path.toLowerCase().includes(lowerSearchTerm)
      );
    }

    // --- 2. Filter by Positive Regex (if active) ---
    const matchedPathsByRegex = new Set<string>();

    if (regexState.isRegexActive) {
      const titleRegexTrimmed = regexState.titleRegex.trim();
      const contentRegexTrimmed = regexState.contentRegex.trim();
      const hasTitleRegex = !!titleRegexTrimmed;
      const hasContentRegex = !!contentRegexTrimmed;
      const hasFileContents = Object.keys(fileContentsMap).length > 0;

      if (hasTitleRegex || hasContentRegex) { // Only filter if a regex pattern exists
        // Apply title regex
        if (hasTitleRegex) {
          try {
            const regex = new RegExp(titleRegexTrimmed);
            filesToFilter.forEach(file => {
              if (regex.test(file.path)) {
                matchedPathsByRegex.add(file.path); // Add matches from title regex
              }
            });
            titleRegexError = null; // Clear error if regex is valid
          } catch (e) {
            titleRegexError = e instanceof Error ? e.message : "Invalid title regex";
            console.error("Title Regex Error:", e);
          }
        }

        // Apply content regex
        if (hasContentRegex && hasFileContents) {
          try {
            const regex = new RegExp(contentRegexTrimmed, 'm'); // Use multiline flag
            filesToFilter.forEach(file => {
              const content = fileContentsMap[file.path];
              if (typeof content === 'string' && regex.test(content)) {
                matchedPathsByRegex.add(file.path); // Add matches from content regex
              }
            });
            contentRegexError = null; // Clear error if regex is valid
          } catch (e) {
            contentRegexError = e instanceof Error ? e.message : "Invalid content regex";
            console.error("Content Regex Error:", e);
          }
        }

        // Filter based on the combined matches from *either* title or content regex
        if (hasTitleRegex || hasContentRegex) {
          filteredFiles = filesToFilter.filter(file => matchedPathsByRegex.has(file.path));
        } else {
          // If regex is active but neither pattern is valid or provided, return the search-filtered list
          filteredFiles = filesToFilter;
        }
      } else {
        // Regex is active, but no patterns provided
        filteredFiles = filesToFilter;
      }

      // --- 3. Apply Negative Regex Filtering (exclude matches) ---
      const negativeTitleRegexTrimmed = regexState.negativeTitleRegex.trim();
      const negativeContentRegexTrimmed = regexState.negativeContentRegex.trim();
      const hasNegativeTitleRegex = !!negativeTitleRegexTrimmed;
      const hasNegativeContentRegex = !!negativeContentRegexTrimmed;
      
      if (hasNegativeTitleRegex || hasNegativeContentRegex) {
        // Files to be excluded based on negative patterns
        const excludeByNegativeRegex = new Set<string>();
        
        // Apply negative title regex
        if (hasNegativeTitleRegex) {
          try {
            const regex = new RegExp(negativeTitleRegexTrimmed);
            filteredFiles.forEach(file => {
              if (regex.test(file.path)) {
                excludeByNegativeRegex.add(file.path);
              }
            });
            negativeTitleRegexError = null;
          } catch (e) {
            negativeTitleRegexError = e instanceof Error ? e.message : "Invalid negative title regex";
            console.error("Negative Title Regex Error:", e);
          }
        }
        
        // Apply negative content regex
        if (hasNegativeContentRegex && hasFileContents) {
          try {
            const regex = new RegExp(negativeContentRegexTrimmed, 'm');
            filteredFiles.forEach(file => {
              const content = fileContentsMap[file.path];
              if (typeof content === 'string' && regex.test(content)) {
                excludeByNegativeRegex.add(file.path);
              }
            });
            negativeContentRegexError = null;
          } catch (e) {
            negativeContentRegexError = e instanceof Error ? e.message : "Invalid negative content regex";
            console.error("Negative Content Regex Error:", e);
          }
        }
        
        // Exclude files that match negative patterns
        if (excludeByNegativeRegex.size > 0) {
          filteredFiles = filteredFiles.filter(file => !excludeByNegativeRegex.has(file.path));
        }
      }
    } else {
      // Regex is inactive, just use the search-filtered list
      filteredFiles = filesToFilter;
    }

    // --- 4. Filter by "Show Only Selected" ---
    if (showOnlySelected) {
      filteredFiles = filteredFiles.filter(file => file.included && !file.forceExcluded);
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
    showOnlySelected, 
    regexState.isRegexActive, 
    regexState.titleRegex, 
    regexState.contentRegex, 
    regexState.negativeTitleRegex,
    regexState.negativeContentRegex,
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