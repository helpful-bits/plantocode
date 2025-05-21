"use client";

import { createContext, useContext, useEffect } from "react";
import type { ReactNode } from "react";

import {
  useProjectDirectoryManager,
  type ProjectDirectoryState,
} from "./_hooks/use-project-directory-manager";
import { useUILayout } from "./ui-layout-context";

export interface ProjectContextValue extends ProjectDirectoryState {
  setProjectDirectory: (dir: string) => Promise<void>;
}

// Create the context without default values, will force provider usage
const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { setAppInitializing } = useUILayout();

  // Use the extracted hook for project directory management
  const {
    projectDirectory,
    isLoading,
    error,
    setProjectDirectory,
    isInitialLoadingRef,
  } = useProjectDirectoryManager();

  // Update app initializing state based on loading state
  useEffect(() => {
    // Only update app initializing when initial loading completes
    if (!isInitialLoadingRef.current && !isLoading) {
      setAppInitializing(false);
    }
  }, [isLoading, setAppInitializing, isInitialLoadingRef]);

  return (
    <ProjectContext.Provider
      value={{
        projectDirectory,
        setProjectDirectory,
        isLoading,
        error,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}
