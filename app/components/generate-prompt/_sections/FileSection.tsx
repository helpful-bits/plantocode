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
          console.log(`[FileSection] Bulk toggle ${shouldInclude ? 'selecting' : 'deselecting'} ${targetFiles.length} files`);
          
          // First update local state
          fileState.handleBulkToggle(targetFiles as any, shouldInclude);
          
          // Then ensure we save to backend with some delay to let React finish updating
          setTimeout(() => {
            const state = fileState.getFileStateForSession();
            console.log(`[FileSection] Saving bulk update: included=${state.includedFiles.length}, excluded=${state.forceExcludedFiles.length}`);
            if (context.saveSessionState && context.activeSessionId) {
              // This bypasses all the debouncing and directly saves the state
              context.saveSessionState(context.activeSessionId, undefined, state);
            }
          }, 100);
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
            ? "Finding relevant files (analyzing file contents)..." 
            : fileState.isLoadingFiles 
              ? "Loading files..." 
              : ""
        }
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