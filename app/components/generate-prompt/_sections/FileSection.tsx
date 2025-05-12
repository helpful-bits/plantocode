"use client";

import React from "react";
import FileBrowser from "../file-browser";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";

interface FileSectionProps {
  disabled?: boolean;
}

const FileSection = React.memo(function FileSection({
  disabled = false
}: FileSectionProps) {
  // Get state and actions from contexts
  const context = useGeneratePrompt();
  const fileState = useFileManagement();
  const regexState = context.regexState;

  // Calculate if regex is available based on regex patterns
  const isRegexAvailable = !!(
    regexState.titleRegex.trim() ||
    regexState.contentRegex.trim() ||
    regexState.negativeTitleRegex.trim() ||
    regexState.negativeContentRegex.trim()
  );

  // Handle filter mode changes and synchronize with regex state
  const handleFilterModeChange = (newMode: 'all' | 'selected' | 'regex') => {
    fileState.setFilterMode(newMode);
    regexState.setIsRegexActive(newMode === 'regex');
    context.handleInteraction(() => fileState.getFileStateForSession());
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
          console.log(`[FileSection] Bulk toggle ${shouldInclude ? 'selecting' : 'deselecting'} ${targetFiles.length} files`);

          // Update state through fileState.handleBulkToggle which will trigger the proper interaction handlers
          fileState.handleBulkToggle(targetFiles as any, shouldInclude);
        }}
        filterMode={fileState.filterMode}
        onFilterModeChange={handleFilterModeChange}
        isRegexAvailable={isRegexAvailable}
        onInteraction={() => context.handleInteraction(() => fileState.getFileStateForSession())}
        refreshFiles={async (preserveState?: boolean) => {
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
        regexState={context.regexState}
        disabled={disabled}
      />
    </>
  );
});

export default FileSection;