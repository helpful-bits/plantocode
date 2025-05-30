"use client";

import { createContext, useContext } from "react";

import {
  type FilesMap,
  type FileInfo,
} from "../_hooks/file-management/use-project-file-list";
import { logError } from "@/utils/error-handling";

export interface FileManagementContextValue {
  managedFilesMap: FilesMap;
  searchTerm: string;
  filterMode: "all" | "selected";
  externalPathWarnings: string[];
  includedPaths: string[];
  excludedPaths: string[];
  searchSelectedFilesOnly: boolean;
  isLoadingFiles: boolean;
  isInitialized: boolean;
  isFindingFiles: boolean;
  currentWorkflowStage?: string;
  currentStageMessage?: string;
  workflowError?: string | null;
  fileContentsMap: Record<string, string>;
  fileLoadError?: string;
  findFilesMode: "replace" | "extend";
  canUndo: boolean;
  canRedo: boolean;

  setSearchTerm: (searchTerm: string) => void;
  setFilterMode: (mode: "all" | "selected") => void;
  toggleFileSelection: (filePath: string) => void;
  toggleFileExclusion: (filePath: string) => void;
  toggleSearchSelectedFilesOnly: (value?: boolean) => void;
  handleBulkToggle: (files: FileInfo[], include: boolean) => void;
  findRelevantFiles: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  flushPendingOperations?: () => void;
  flushFileStateSaves: () => Promise<boolean>;
  setFindFilesMode: (mode: "replace" | "extend") => void;
  undoSelection: () => void;
  redoSelection: () => void;

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
    const error = new Error(
      "useFileManagement must be used within a FileManagementProvider"
    );
    logError(error, "File Management Context - Hook Used Outside Provider").catch(() => {});
    throw error;
  }
  return context;
}

// The FileManagementProvider component is implemented in ./file-management-provider.tsx

export { FileManagementContext };
