"use client";

import { useMemo } from "react";

import { type FilesMap } from "./use-project-file-list";

import type { FileInfo } from "@/types";

interface UseFileFilteringProps {
  managedFilesMap: FilesMap;
  fileContentsMap: { [key: string]: string };
  searchTerm: string;
  filterMode: "all" | "selected";
}

/**
 * Hook for filtering files based on search term, regex, and selection state
 */
export function useFileFiltering({
  managedFilesMap,
  fileContentsMap,
  searchTerm,
  filterMode,
}: UseFileFilteringProps) {
  // Extract the filtering logic from FileBrowser component
  const filteredFiles = useMemo(() => {
    // Skip filtering if files are empty
    if (!managedFilesMap || Object.keys(managedFilesMap).length === 0) {
      return [];
    }
    
    // Early return if all filters are empty or disabled
    const hasSearchTerm = searchTerm.trim().length > 0;
    
    if (filterMode === 'all' && !hasSearchTerm) {
      return Object.values(managedFilesMap);
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


    return filteredFilesInLoop;
  }, [
    managedFilesMap,
    searchTerm,
    filterMode,
    fileContentsMap,
  ]);

  return {
    filteredFiles,
  };
}
