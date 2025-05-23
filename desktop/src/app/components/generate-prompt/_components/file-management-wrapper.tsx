"use client";

import React, { useEffect } from "react";

import { useFileManagement } from "../_contexts/file-management-context";

import FileManagementContent from "./file-management-content";

interface FileManagementWrapperProps {
  projectDirectory: string | null;
  hasSession: boolean;
}

/**
 * Wrapper component for FileManagementContent
 * Handles the conditional rendering of FileManagementContent based on session state
 * Consumes the FileManagementContext provided by its parent
 */
function FileManagementWrapper({
  projectDirectory,
  hasSession,
}: FileManagementWrapperProps) {
  // Verify context is available - will throw if used outside of FileManagementProvider
  // Just verify the context is available by calling the hook
  const fileManagementState = useFileManagement();
  
  // Auto-initialize file list when component mounts with valid session
  useEffect(() => {
    if (projectDirectory && hasSession && !fileManagementState.isInitialized && !fileManagementState.isLoadingFiles) {
      fileManagementState.refreshFiles().catch(() => {
        // Error handled by the hook
      });
    }
  }, [projectDirectory, hasSession, fileManagementState.isInitialized, fileManagementState.isLoadingFiles, fileManagementState.refreshFiles]);
  
  // Return null when no project directory exists
  if (!projectDirectory) return null;

  return (
    <>
      {!hasSession ? (
        <div className="text-center text-muted-foreground italic p-4 border border-dashed rounded-md border-border bg-card/50">
          Create a new session or load an existing one to start working.
        </div>
      ) : (
        <FileManagementContent hasSession={hasSession} />
      )}
    </>
  );
}

// Memoize the wrapper component to prevent unnecessary re-renders
export const MemoizedFileManagementWrapper = React.memo(FileManagementWrapper);
export default MemoizedFileManagementWrapper;
