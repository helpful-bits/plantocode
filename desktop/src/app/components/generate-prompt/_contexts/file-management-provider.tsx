"use client";

import { type ReactNode, useRef } from "react";

import { useSessionStateContext } from "@/contexts/session";

import { useFileManagementState } from "../_hooks/use-file-management-state";

import { FileManagementContext } from "./file-management-context";

interface FileManagementProviderProps {
  children: ReactNode;
}

/**
 * Provider component for file management
 * Provides file selection and management capabilities to its children
 */
export function FileManagementProvider({
  children,
}: FileManagementProviderProps) {
  // Get the session transition state for passing to child components
  const { activeSessionId, isSessionLoading: isTransitioningSession } =
    useSessionStateContext();

  // Track session ID changes in a ref for better debugging
  const prevSessionIdRef = useRef<string | null>(null);
  const prevTransitionStateRef = useRef<boolean>(false);

  const fileManagementState = useFileManagementState();

  // Update refs for debugging purposes (kept for debugging)
  prevSessionIdRef.current = activeSessionId;
  prevTransitionStateRef.current = isTransitioningSession;

  // Access file state for component rendering
  // const { isInitialized } = fileManagementState; - Not used

  return (
    <FileManagementContext.Provider value={fileManagementState}>
      {children}
    </FileManagementContext.Provider>
  );
}

FileManagementProvider.displayName = "FileManagementProvider";
