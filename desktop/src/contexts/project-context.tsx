"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import {
  useProjectDirectoryManager,
  type ProjectDirectoryState,
} from "./_hooks/use-project-directory-manager";

export interface ProjectContextValue extends ProjectDirectoryState {
  setProjectDirectory: (dir: string) => Promise<void>;
}

// Create the context without default values, will force provider usage
const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  // Use the extracted hook for project directory management
  const {
    projectDirectory,
    isLoading,
    error,
    setProjectDirectory,
  } = useProjectDirectoryManager();

  // AuthFlowManager now controls app initialization state

  const value = useMemo(
    () => ({
      projectDirectory,
      setProjectDirectory,
      isLoading,
      error,
    }),
    [projectDirectory, setProjectDirectory, isLoading, error]
  );

  return (
    <ProjectContext.Provider value={value}>
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
