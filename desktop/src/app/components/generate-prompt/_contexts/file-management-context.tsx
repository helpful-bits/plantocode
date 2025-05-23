"use client";

import { createContext, useContext } from "react";

import {
  type FilesMap,
  type FileInfo,
} from "../_hooks/file-management/use-project-file-list";

export interface FileManagementContextValue {
  // State
  managedFilesMap: FilesMap;
  searchTerm: string;
  filterMode: "all" | "selected" | "regex";
  isRegexAvailable: boolean;
  externalPathWarnings: string[];
  includedPaths: string[];
  excludedPaths: string[];
  searchSelectedFilesOnly: boolean;
  isLoadingFiles: boolean;
  isInitialized: boolean;
  isFindingFiles: boolean;
  findingFilesJobId: string | null;
  fileContentsMap: Record<string, string>;
  fileLoadError: string | null;
  findFilesMode: "replace" | "extend";
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  setSearchTerm: (searchTerm: string) => void;
  setFilterMode: (mode: "all" | "selected" | "regex") => void;
  toggleFileSelection: (filePath: string) => void;
  toggleFileExclusion: (filePath: string) => void;
  toggleSearchSelectedFilesOnly: (value?: boolean) => void;
  handleBulkToggle: (files: FileInfo[], include: boolean) => void;
  addPathsToSelection: (paths: string[]) => void; // Add paths to existing selection
  replaceSelectionWithPaths: (paths: string[]) => void; // Replace selection with new paths
  findRelevantFiles: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  flushPendingOperations?: () => void;
  flushFileStateSaves: () => Promise<boolean>;
  setFindFilesMode: (mode: "replace" | "extend") => void;
  undoSelection: () => void;
  redoSelection: () => void;

  // Session state extraction for saving
  getFileStateForSession: () => {
    searchTerm: string;
    includedFiles: string[];
    forceExcludedFiles: string[];
    searchSelectedFilesOnly: boolean;
  };
}

const FileManagementContext = createContext<FileManagementContextValue | null>(
  null
);

export function useFileManagement(): FileManagementContextValue {
  const context = useContext(FileManagementContext);
  if (!context) {
    throw new Error(
      "useFileManagement must be used within a FileManagementProvider"
    );
  }
  return context;
}

// The FileManagementProvider component is implemented in ./file-management-provider.tsx

export { FileManagementContext };
