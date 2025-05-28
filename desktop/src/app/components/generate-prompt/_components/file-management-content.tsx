"use client";

import React from "react";

import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";
import ActionsSection from "../_sections/actions-section";
import FileSection from "../_sections/file-section";
import TaskSection from "../_sections/task-section";

interface FileManagementContentProps {
  hasSession: boolean;
}

/**
 * Component responsible for rendering the content when a file management context is available
 * Handles task section, actions section, and file section
 * Uses contexts directly instead of receiving props
 */
function FileManagementContent({ hasSession }: FileManagementContentProps) {
  // Access contexts directly
  const fileState = useFileManagement();

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
    </>
  );
}

FileManagementContent.displayName = "FileManagementContent";

export default React.memo(FileManagementContent);
