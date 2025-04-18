"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useInitialization } from "./initialization-context";
import { normalizePath } from "@/lib/path-utils";

interface ProjectContextType {
  projectDirectory: string;
  setProjectDirectory: (dir: string) => void;
  isLoading: boolean;
  error: string | null;
}

// Default context values
const defaultContextValue: ProjectContextType = {
  projectDirectory: "",
  setProjectDirectory: () => {},
  isLoading: true,
  error: null
};

const ProjectContext = createContext<ProjectContextType>(defaultContextValue);

export function ProjectProvider({ children }: { children: ReactNode }) {
  // Use initialization context instead of managing state directly
  const {
    projectDirectory: initProjectDirectory,
    setProjectDirectory: initSetProjectDirectory,
    isLoading: initIsLoading,
    error: initError,
    stage
  } = useInitialization();
  
  // Local state just for compatibility with existing code
  const [projectDirectory, setProjectDirectoryState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Sync with initialization context
  useEffect(() => {
    const normalizedDir = initProjectDirectory ? normalizePath(initProjectDirectory) : "";
    if (normalizedDir !== projectDirectory) {
      console.log(`[ProjectContext] Syncing project directory from initialization context: ${normalizedDir}`);
      setProjectDirectoryState(normalizedDir);
    }
    
    setIsLoading(initIsLoading || stage !== 'ready');
    setError(initError);
  }, [initProjectDirectory, initIsLoading, initError, stage, projectDirectory]);
  
  // Set project directory via initialization context
  const setProjectDirectory = (dir: string) => {
    if (!dir) return;
    
    const normalizedDir = normalizePath(dir);
    if (normalizedDir !== projectDirectory) {
      console.log(`[ProjectContext] Setting project directory: ${normalizedDir}`);
      initSetProjectDirectory(normalizedDir, 'picker');
    }
  };
  
  return (
    <ProjectContext.Provider value={{ 
      projectDirectory, 
      setProjectDirectory,
      isLoading,
      error
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
