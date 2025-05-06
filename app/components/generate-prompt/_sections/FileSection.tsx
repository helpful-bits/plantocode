"use client";

import React, { useEffect } from "react";
import FileBrowser from "../file-browser";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";

const FileSection = React.memo(function FileSection() {
  // Get state and actions from contexts
  const context = useGeneratePrompt();
  const fileState = useFileManagement();
  const regexState = context.regexState;
  

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
          // Type assertion to fix incompatible FileInfo types
          fileState.handleBulkToggle(targetFiles as any, shouldInclude);
        }}
        showOnlySelected={fileState.showOnlySelected}
        onShowOnlySelectedChange={() => fileState.setShowOnlySelected(!fileState.showOnlySelected)}
        onInteraction={() => context.handleInteraction(() => fileState.getFileStateForSession())}
        refreshFiles={async (preserveState?: boolean) => {
          await fileState.refreshFiles();
        }}
        isLoading={fileState.isLoadingFiles || fileState.isFindingFiles}
        loadingMessage={
          fileState.isFindingFiles 
            ? "Finding relevant files..." 
            : fileState.isLoadingFiles 
              ? "Loading files..." 
              : ""
        }
        onAddPath={(path) => {
          fileState.setPastedPaths(
            fileState.pastedPaths 
              ? `${fileState.pastedPaths}\n${path}` 
              : path
          );
        }}
        onFindRelevantFiles={fileState.findRelevantFiles}
        isFindingFiles={fileState.isFindingFiles}
        searchSelectedFilesOnly={fileState.searchSelectedFilesOnly}
        onToggleSearchSelectedFilesOnly={fileState.toggleSearchSelectedFilesOnly}
        taskDescription={context.taskState.taskDescription}
        regexState={context.regexState}
      />
    </>
  );
});

export default FileSection;