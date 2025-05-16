"use client";

import { ReactNode, useEffect, useRef } from "react";
import { useFileManagementState } from "../_hooks/use-file-management-state";
import { FileManagementContext } from "./file-management-context";
import { useSessionContext } from "@core/lib/contexts/session-context";
import { Session } from "@core/types/session-types";
import { useStableRef } from "../_hooks/use-stable-refs";

interface FileManagementProviderProps {
  children: ReactNode;
  projectDirectory: string;
  taskDescription: string;
}

export function FileManagementProvider({
  children,
  projectDirectory,
  taskDescription,
}: FileManagementProviderProps) {
  // Get the session transition state for passing to child components
  const { activeSessionId, isTransitioningSession } = useSessionContext();

  // Track session ID changes in a ref for better debugging
  const prevSessionIdRef = useRef<string | null>(null);
  const prevTransitionStateRef = useRef<boolean>(false);

  // DEBUG: Log immediate mount events, but only in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEBUG][FileManagementProvider] Mounting - project: ${projectDirectory}, session: ${activeSessionId}, transitioning: ${isTransitioningSession}`);
  }


  // Create the file management state by passing stable props
  // Use a ref to avoid passing the props directly during render
  const stateProps = useRef({
    projectDirectory,
    taskDescription,
    isTransitioningSession,
  });

  // Update the ref when props change
  useEffect(() => {
    stateProps.current = {
      projectDirectory,
      taskDescription,
      isTransitioningSession,
    };
  }, [projectDirectory, taskDescription, isTransitioningSession]);

  const fileManagementState = useFileManagementState(stateProps.current);

  // Log session changes for better debugging
  useEffect(() => {
    if (activeSessionId !== prevSessionIdRef.current) {
      console.log(`[FileManagementProvider] Session ID changed from "${prevSessionIdRef.current}" to "${activeSessionId}"`);

      // Update ref for next comparison
      prevSessionIdRef.current = activeSessionId;
    }
  }, [activeSessionId]);

  // Log transition state changes
  useEffect(() => {
    if (isTransitioningSession !== prevTransitionStateRef.current) {
      console.log(`[FileManagementProvider] Transition state changed from ${prevTransitionStateRef.current} to ${isTransitioningSession}`);

      // Update ref for next comparison
      prevTransitionStateRef.current = isTransitioningSession;
    }
  }, [isTransitioningSession]);

  // Extract initialization state for better logging
  const { isInitialized, isLoadingFiles, fileLoadError } = fileManagementState;

  // Log initialization and loading state changes
  useEffect(() => {
    console.log(`[FileManagementProvider] File state update: isInitialized=${isInitialized}, isLoadingFiles=${isLoadingFiles}, hasError=${!!fileLoadError}`);
  }, [isInitialized, isLoadingFiles, fileLoadError]);

  return (
    <FileManagementContext.Provider value={fileManagementState}>
      {children}
    </FileManagementContext.Provider>
  );
}