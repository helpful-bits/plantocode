"use client";

import { FilesMap, FileInfo } from "../_hooks/file-management/use-project-file-list";
import { createContext, useContext, ReactNode } from "react";

export interface FileManagementContextValue {
  // State
  managedFilesMap: FilesMap;
  searchTerm: string;
  showOnlySelected: boolean;
  pastedPaths: string;
  externalPathWarnings: string[];
  includedPaths: string[];
  excludedPaths: string[];
  searchSelectedFilesOnly: boolean;
  isLoadingFiles: boolean;
  isFindingFiles: boolean;
  findingFilesJobId: string | null;
  fileContentsMap: Record<string, string>;
  
  // Actions
  setSearchTerm: (searchTerm: string) => void;
  setShowOnlySelected: (showOnlySelected: boolean) => void;
  setPastedPaths: (pastedPaths: string) => void;
  toggleFileSelection: (filePath: string) => void;
  toggleFileExclusion: (filePath: string) => void;
  toggleSearchSelectedFilesOnly: () => void;
  handleBulkToggle: (files: FileInfo[], include: boolean) => void;
  applySelectionsFromPaths: (paths: string[]) => void;
  findRelevantFiles: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  
  // Session state extraction for saving
  getFileStateForSession: () => {
    searchTerm: string;
    pastedPaths: string;
    includedFiles: string[];
    forceExcludedFiles: string[];
    searchSelectedFilesOnly: boolean;
  };
}

const FileManagementContext = createContext<FileManagementContextValue | null>(null);

export function useFileManagement(): FileManagementContextValue {
  const context = useContext(FileManagementContext);
  if (!context) {
    throw new Error("useFileManagement must be used within a FileManagementProvider");
  }
  return context;
}

// The FileManagementProvider component is implemented in ./file-management-provider.tsx

export { FileManagementContext };