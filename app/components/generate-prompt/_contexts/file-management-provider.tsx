"use client";

import { ReactNode, useEffect, useRef } from "react";
import { useFileManagementState } from "../_hooks/use-file-management-state";
import { FileManagementContext } from "./file-management-context";
import { useGeneratePrompt } from "./generate-prompt-context";
import { Session } from "@/types/session-types";

interface FileManagementProviderProps {
  children: ReactNode;
  projectDirectory: string;
  activeSessionId: string | null;
  taskDescription: string;
  sessionData?: Session;
  isSwitchingSession?: boolean;
}

export function FileManagementProvider({
  children,
  projectDirectory,
  activeSessionId,
  taskDescription,
  sessionData,
  isSwitchingSession = false,
}: FileManagementProviderProps) {
  const context = useGeneratePrompt();

  // Create the file management state, passing in the data from the session if it exists
  const fileManagementState = useFileManagementState({
    projectDirectory,
    activeSessionId,
    taskDescription,
    onInteraction: () => {
      if (context && activeSessionId) {
        // Use the file state getter pattern to provide current file state to the context
        context.handleInteraction(() => fileManagementState.getFileStateForSession());
      }
    },
    sessionData: sessionData ? {
      includedFiles: sessionData.includedFiles,
      forceExcludedFiles: sessionData.forceExcludedFiles,
      searchTerm: sessionData.searchTerm,
      searchSelectedFilesOnly: sessionData.searchSelectedFilesOnly,
    } : undefined,
    isSwitchingSession, // Pass the session switching flag
  });

  // Keep track of session data for debugging
  const fileSelectionsRef = useRef({
    includedFiles: sessionData?.includedFiles || [],
    forceExcludedFiles: sessionData?.forceExcludedFiles || []
  });
  
  // Update ref when session data changes (for debugging purposes only)
  useEffect(() => {
    if (sessionData) {
      fileSelectionsRef.current = {
        includedFiles: sessionData.includedFiles || [],
        forceExcludedFiles: sessionData.forceExcludedFiles || []
      };
      console.log(`[FileManagementProvider] Received session data with ${sessionData.includedFiles?.length || 0} included files`);
    }
  }, [sessionData]);
  
  // Handle component unmounting or session change
  useEffect(() => {
    // Clean up when the component unmounts
    return () => {
      // Force immediate save of any pending changes before unmounting
      if (fileManagementState.flushPendingOperations) {
        console.log('[FileManagementProvider] Component unmounting, flushing pending operations');
        fileManagementState.flushPendingOperations();
        
        // Also trigger a manual interaction if needed
        if (context && activeSessionId) {
          console.log('[FileManagementProvider] Forcing final state update before unmount');
          context.handleInteraction(() => fileManagementState.getFileStateForSession());
        }
      }
    };
  }, [fileManagementState, context, activeSessionId]);

  return (
    <FileManagementContext.Provider value={fileManagementState}>
      {children}
    </FileManagementContext.Provider>
  );
}