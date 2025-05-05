"use client";

import { ReactNode, useEffect, useRef, useMemo } from "react";
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
}

export function FileManagementProvider({
  children,
  projectDirectory,
  activeSessionId,
  taskDescription,
  sessionData,
}: FileManagementProviderProps) {
  const context = useGeneratePrompt();
  const lastSessionIdRef = useRef<string | null>(null);

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
      pastedPaths: sessionData.pastedPaths,
      searchSelectedFilesOnly: sessionData.searchSelectedFilesOnly,
    } : undefined,
  });

  // Handle session changes - memoize the dependencies to avoid frequent re-renders
  const memoizedSessionId = useMemo(() => activeSessionId, [activeSessionId]);
  const memoizedSessionData = useMemo(() => sessionData, [sessionData]);
  
  useEffect(() => {
    if (memoizedSessionId !== lastSessionIdRef.current) {
      lastSessionIdRef.current = memoizedSessionId;

      // If we have session data and the session ID changed, apply it
      if (memoizedSessionData && memoizedSessionData.id === memoizedSessionId) {
        // Log that we're applying session data
        console.log(`[FileManagementProvider] Applying session data for ${memoizedSessionId}`);
      }
    }
  }, [memoizedSessionId, memoizedSessionData]);

  return (
    <FileManagementContext.Provider value={fileManagementState}>
      {children}
    </FileManagementContext.Provider>
  );
}