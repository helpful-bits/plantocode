"use client";

import React from "react";

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

  return (
    <>
      {/* Task section */}
      <div className="mt-4">
        <TaskSection disabled={!hasSession} />
      </div>

      {/* File section */}
      <FileSection disabled={!hasSession} />
    </>
  );
}

FileManagementContent.displayName = "FileManagementContent";

export default React.memo(FileManagementContent);
