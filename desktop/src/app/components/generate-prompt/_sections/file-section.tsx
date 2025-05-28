"use client";

import React, { useMemo, useCallback } from "react";

import { useSessionStateContext } from "@/contexts/session";
import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";
import FileBrowser from "../file-browser";

interface FileSectionProps {
  disabled?: boolean;
}

const FileSection = React.memo(function FileSection({
  disabled = false,
}: FileSectionProps) {
  // Get state and actions from contexts
  const fileState = useFileManagement();
  const coreContext = useCorePromptContext();
  const { currentSession } = useSessionStateContext();


  // Handle filter mode changes
  const handleFilterModeChange = useCallback((newMode: "all" | "selected") => {
    fileState.setFilterMode(newMode);
    coreContext.actions.handleInteraction();
  }, [
    fileState.setFilterMode,
    coreContext.actions
  ]);

  // Memoize bulk toggle handler to ensure stable prop
  const handleBulkToggle = useCallback((shouldInclude: boolean, targetFiles: any[]) => {
    // Update state through fileState.handleBulkToggle which will trigger the proper interaction handlers
    fileState.handleBulkToggle(targetFiles, shouldInclude);
  }, [fileState.handleBulkToggle]);

  // Memoize refresh files handler to ensure stable prop
  const handleRefreshFiles = useCallback(async (_preserveState?: boolean) => {
    await fileState.refreshFiles();
  }, [fileState.refreshFiles]);

  // Create a minimal regex state for compatibility
  const regexState = useMemo(() => ({
    titleRegex: "",
    contentRegex: "",
    negativeTitleRegex: "",
    negativeContentRegex: "",
    isRegexActive: false,
    regexGenerationError: null,
  }), []);

  return (
    <>
      <FileBrowser
        managedFilesMap={fileState.managedFilesMap}
        fileContentsMap={fileState.fileContentsMap || {}} // Use fileContentsMap from context or empty object as fallback
        searchTerm={fileState.searchTerm}
        onSearchChange={fileState.setSearchTerm}
        onToggleSelection={fileState.toggleFileSelection}
        onToggleExclusion={fileState.toggleFileExclusion}
        onBulkToggle={handleBulkToggle}
        filterMode={fileState.filterMode}
        onFilterModeChange={handleFilterModeChange}
        refreshFiles={handleRefreshFiles}
        isLoading={fileState.isLoadingFiles || fileState.isFindingFiles}
        isInitialized={fileState.isInitialized}
        fileLoadError={fileState.fileLoadError}
        loadingMessage={
          fileState.isFindingFiles
            ? "Finding relevant files (analyzing file contents)..."
            : !fileState.isInitialized
              ? "Initializing file list..."
              : fileState.isLoadingFiles
                ? "Loading files..."
                : ""
        }
        regexState={regexState}
        isFindingFiles={fileState.isFindingFiles}
        executeFindRelevantFiles={fileState.findRelevantFiles}
        findFilesMode={fileState.findFilesMode}
        setFindFilesMode={fileState.setFindFilesMode}
        canUndo={fileState.canUndo}
        canRedo={fileState.canRedo}
        undoSelection={fileState.undoSelection}
        redoSelection={fileState.redoSelection}
        taskDescription={currentSession?.taskDescription || ""}
        disabled={disabled}
      />
    </>
  );
});

FileSection.displayName = "FileSection";

export default FileSection;