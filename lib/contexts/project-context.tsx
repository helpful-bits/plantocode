"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";

interface ProjectContextType {
  projectDirectory: string;
  setProjectDirectory: (dir: string) => void;
}

const PROJECT_DIR_KEY = "o1-pro-flow-project-dir";

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectDirectory, setProjectDirectoryState] = useState("");

  useEffect(() => {
    const savedDir = localStorage.getItem(PROJECT_DIR_KEY);
    if (savedDir) setProjectDirectoryState(savedDir);
  }, []);

  const setProjectDirectory = (dir: string) => {
    setProjectDirectoryState(dir);
    localStorage.setItem(PROJECT_DIR_KEY, dir);
  };

  return (
    <ProjectContext.Provider value={{ projectDirectory, setProjectDirectory }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
} 