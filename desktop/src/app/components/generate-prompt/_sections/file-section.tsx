"use client";

import React from "react";

import { useFileManagement } from "../_contexts/file-management-context";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";
import FileBrowser from "../file-browser";

interface FileSectionProps {
  disabled?: boolean;
}

const FileSection = React.memo(function FileSection({
  disabled = false,
}: FileSectionProps) {
  // Get state and actions from contexts
  const context = useGeneratePrompt();
  const fileState = useFileManagement();
  const regexState = context.regex;

  // Calculate if regex is available based on regex patterns
  const isRegexAvailable = !!(
    regexState.titleRegex.trim() ||
    regexState.contentRegex.trim() ||
    regexState.negativeTitleRegex.trim() ||
    regexState.negativeContentRegex.trim()
  );

  // Handle filter mode changes and synchronize with regex state
  const handleFilterModeChange = (newMode: "all" | "selected" | "regex") => {
    fileState.setFilterMode(newMode);
    
    // Update regex state if needed
    if (newMode === "regex" !== regexState.isRegexActive) {
      // When toggling regex mode, update through context actions
      if (newMode === "regex") {
        // Enable regex mode
        context.regex.handleGenerateRegexFromTask();
      } else {
        // Disable regex mode - the clear function also disables regex mode
        context.regex.handleClearPatterns();
      }
    }
    
    context.core.handleInteraction();
  };

  return (
    <>
      <FileBrowser
        managedFilesMap={fileState.managedFilesMap}
        fileContentsMap={fileState.fileContentsMap || {}} // Use fileContentsMap from context or empty object as fallback
        searchTerm={fileState.searchTerm}
        onSearchChange={fileState.setSearchTerm}
        onToggleSelection={fileState.toggleFileSelection}
        onToggleExclusion={fileState.toggleFileExclusion}
        onBulkToggle={(shouldInclude, targetFiles) => {
          // Update state through fileState.handleBulkToggle which will trigger the proper interaction handlers
          fileState.handleBulkToggle(targetFiles, shouldInclude);
        }}
        filterMode={fileState.filterMode}
        onFilterModeChange={handleFilterModeChange}
        isRegexAvailable={isRegexAvailable}
        onInteraction={() => context.core.handleInteraction()}
        refreshFiles={async (_preserveState?: boolean) => {
          await fileState.refreshFiles();
        }}
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
        regexState={context.regex}
        disabled={disabled}
      />
    </>
  );
});

export default FileSection;