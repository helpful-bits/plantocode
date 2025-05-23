"use client";

import React from "react";

import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";
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
  // Note: regex errors are not currently exposed in the new context structure
  // For now, we pass null to ActionsSection for regex error props

  // Get task data from context
  const coreContext = useCorePromptContext();

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
          setFindFilesMode={(mode: 'ai' | 'manual') =>
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
