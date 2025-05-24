"use client";

import React from "react";

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

  // Handle filter mode changes and synchronize with regex state
  const handleFilterModeChange = (newMode: "all" | "selected" | "regex") => {
    fileState.setFilterMode(newMode);
    
    // Update regex state if needed
    if (newMode === "regex" !== currentSession?.isRegexActive) {
      // When toggling regex mode, update through context actions
      if (newMode === "regex") {
        // Enable regex mode
        regexContext.actions.handleGenerateRegexFromTask();
      } else {
        // Disable regex mode - the clear function also disables regex mode
        regexContext.actions.handleClearPatterns();
      }
    }
    
    coreContext.actions.handleInteraction();
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
        onInteraction={() => coreContext.actions.handleInteraction()}
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
        regexState={{
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
        }}
        disabled={disabled}
      />
    </>
  );
});

export default FileSection;