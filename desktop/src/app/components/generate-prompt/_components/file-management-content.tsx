"use client";

import React, { useCallback, useEffect } from "react";


import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";
import { useTaskContext } from "../_contexts/task-context";
import { useFileContentLoader } from "../_hooks/use-file-content-loader";
import { usePromptTemplating } from "../_hooks/use-prompt-templating";
import ActionsSection from "../_sections/actions-section";
import FileSection from "../_sections/file-section";
import TaskSection from "../_sections/task-section";

import { default as IPlanActions } from "./implementation-plan-actions";

interface FileManagementContentProps {
  hasSession: boolean;
}

/**
 * Component responsible for rendering the content when a file management context is available
 * Handles task section, actions section, file section, and implementation plan actions
 * Uses contexts directly instead of receiving props
 */
function FileManagementContent({ hasSession }: FileManagementContentProps) {
  // Access contexts directly
  const fileState = useFileManagement();
  const {
    display: displayState,
  } = useGeneratePrompt();

  // Get task data from context
  const taskContext = useTaskContext();
  const coreContext = useCorePromptContext();

  // Create task section state from contexts

  // Import the session actions context
  // const sessionActions = useSessionActionsContext(); - Not used

  // Use our new hooks
  const fileContentLoader = useFileContentLoader({
    allFilesMap: fileState.managedFilesMap,
    fileContentsMap: fileState.fileContentsMap,
    projectDirectory: coreContext.state.projectDirectory || "",
    pastedPaths: displayState.pastedPaths || "",
  });

  const promptTemplating = usePromptTemplating({
    taskDescription: taskContext.state.taskDescription || "",
    relevantFiles: fileContentLoader.filesToUse,
    fileContents: fileContentLoader.currentFileContents,
    projectDirectory: coreContext.state.projectDirectory || "",
  });

  // Connect file content loader with existing UI state
  useEffect(() => {
    if (displayState.externalPathWarnings !== fileContentLoader.warnings) {
      displayState.setExternalPathWarnings(fileContentLoader.warnings);
    }
  }, [fileContentLoader.warnings, displayState]);

  // Connect prompt templating with existing UI state
  useEffect(() => {
    if (displayState.prompt !== promptTemplating.prompt) {
      displayState.setPrompt(promptTemplating.prompt);
    }
    if (displayState.tokenCount !== promptTemplating.tokenCount) {
      displayState.setTokenCount(promptTemplating.tokenCount);
    }
    if (displayState.error !== promptTemplating.error) {
      displayState.setError(promptTemplating.error);
    }
  }, [
    promptTemplating.prompt,
    promptTemplating.tokenCount,
    promptTemplating.error,
    displayState,
  ]);

  // Handle generate prompt action
  const handleGeneratePrompt = useCallback(async () => {
    await fileContentLoader.loadFileContents();
    await promptTemplating.generatePrompt();
  }, [fileContentLoader, promptTemplating]);

  // Connect generate prompt to existing UI action
  useEffect(() => {
    if (displayState.generatePrompt !== handleGeneratePrompt) {
      displayState.setGeneratePrompt(handleGeneratePrompt);
    }
  }, [handleGeneratePrompt, displayState]);

  // Connect copy prompt to existing UI action
  useEffect(() => {
    if (displayState.copyPrompt !== promptTemplating.copyPrompt) {
      displayState.setCopyPrompt(promptTemplating.copyPrompt);
    }
  }, [promptTemplating.copyPrompt, displayState]);

  return (
    <>
      {/* Task section */}
      <div className="mt-4">
        <TaskSection disabled={!hasSession} />
      </div>

      {/* Actions section */}
      <div className="mt-4">
        <ActionsSection
          titleRegexError={null}
          contentRegexError={null}
          negativeTitleRegexError={null}
          negativeContentRegexError={null}
          isFindingFiles={fileState.isFindingFiles}
          executeFindRelevantFiles={fileState.findRelevantFiles}
          findFilesMode={
            fileState.findFilesMode === "replace" ? "ai" : "manual"
          }
          setFindFilesMode={(mode) =>
            fileState.setFindFilesMode(mode === "ai" ? "replace" : "extend")
          }
          searchSelectedFilesOnly={fileState.searchSelectedFilesOnly}
          toggleSearchSelectedFilesOnly={
            fileState.toggleSearchSelectedFilesOnly
          }
          _includedFilesCount={fileState.includedPaths.length}
          canUndo={fileState.canUndo}
          canRedo={fileState.canRedo}
          undoSelection={fileState.undoSelection}
          redoSelection={fileState.redoSelection}
          onInteraction={coreContext.actions.handleInteraction}
          disabled={!hasSession}
        />
      </div>

      {/* File section */}
      <FileSection disabled={!hasSession} />

      {/* Implementation Plan Actions Section */}
      <div className="mt-8">
        <IPlanActions disabled={!hasSession} />
      </div>
    </>
  );
}

export default React.memo(FileManagementContent);
