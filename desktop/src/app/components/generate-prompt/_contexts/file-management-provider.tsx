"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { useSessionStateContext } from "@/contexts/session";

import { useFileManagementState } from "../_hooks/use-file-management-state";

import { FileManagementContext } from "./file-management-context";

interface FileManagementProviderProps {
  children: ReactNode;
  projectDirectory: string;
  taskDescription?: string; // Made optional to allow using TaskContext
}

/**
 * Provider component for file management
 * Provides file selection and management capabilities to its children
 */
export function FileManagementProvider({
  children,
  projectDirectory,
  taskDescription: propTaskDescription, // Renamed to avoid conflicts with context
}: FileManagementProviderProps) {
  // Get the session transition state for passing to child components
  const { activeSessionId, isSessionLoading: isTransitioningSession, currentSession } =
    useSessionStateContext();

  // Use task description from SessionContext if available, otherwise use prop value
  const taskDescription =
    currentSession?.taskDescription || propTaskDescription || "";

  // Track session ID changes in a ref for better debugging
  const prevSessionIdRef = useRef<string | null>(null);
  const prevTransitionStateRef = useRef<boolean>(false);

  // Mount with project directory, session ID, and transition state

  // Create the file management state using a ref to avoid prop updates during render
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

  // Initialize file management state with the props from the ref
  const fileManagementState = useFileManagementState(stateProps.current);

  // Track session changes
  useEffect(() => {
    if (activeSessionId !== prevSessionIdRef.current) {
      // Update ref for next comparison
      prevSessionIdRef.current = activeSessionId;
    }
  }, [activeSessionId]);

  // Track transition state changes
  useEffect(() => {
    if (isTransitioningSession !== prevTransitionStateRef.current) {
      // Update ref for next comparison
      prevTransitionStateRef.current = isTransitioningSession;
    }
  }, [isTransitioningSession]);

  // Access file state for component rendering
  // const { isInitialized } = fileManagementState; - Not used

  return (
    <FileManagementContext.Provider value={fileManagementState}>
      {children}
    </FileManagementContext.Provider>
  );
}
