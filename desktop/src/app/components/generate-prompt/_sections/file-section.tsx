"use client";

import React, { useMemo, useCallback } from "react";

import { useSessionStateContext } from "@/contexts/session";

import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";
import { useRegexContext } from "../_contexts/regex-context";
import FileBrowser from "../file-browser";

interface FileSectionProps {
  disabled?: boolean;
}

const FileSection = React.memo(function FileSection({
  disabled = false,
}: FileSectionProps) {
  // Get state and actions from contexts
  const fileState = useFileManagement();
  const regexContext = useRegexContext();
  const coreContext = useCorePromptContext();
  const { currentSession } = useSessionStateContext();

  // Calculate if regex is available based on regex patterns
  const isRegexAvailable = !!(
    currentSession?.titleRegex?.trim() ||
    currentSession?.contentRegex?.trim() ||
    currentSession?.negativeTitleRegex?.trim() ||
    currentSession?.negativeContentRegex?.trim()
  );

  // Handle filter mode changes
  const handleFilterModeChange = useCallback((newMode: "all" | "selected" | "regex") => {
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

  // Memoize regex state to prevent unnecessary re-renders
  const regexState = useMemo(() => ({
    // Provide regex pattern data from SessionContext
    titleRegex: currentSession?.titleRegex || "",
    contentRegex: currentSession?.contentRegex || "",
    negativeTitleRegex: currentSession?.negativeTitleRegex || "",
    negativeContentRegex: currentSession?.negativeContentRegex || "",
    isRegexActive: currentSession?.isRegexActive || false,
    // Provide UI state from RegexContext
    ...regexContext.state,
    // Provide actions from RegexContext
    ...regexContext.actions
  }), [
    currentSession?.titleRegex,
    currentSession?.contentRegex,
    currentSession?.negativeTitleRegex,
    currentSession?.negativeContentRegex,
    currentSession?.isRegexActive,
    regexContext.state,
    regexContext.actions
  ]);

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
        isRegexAvailable={isRegexAvailable}
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
        disabled={disabled}
      />
    </>
  );
});

FileSection.displayName = "FileSection";

export default FileSection;