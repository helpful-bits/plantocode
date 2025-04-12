"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { GLOBAL_PROJECT_DIR_KEY, PROJECT_DIR_HISTORY_KEY, MAX_PROJECT_DIR_HISTORY } from "@/lib/constants";

interface ProjectContextType {
  projectDirectory: string;
  setProjectDirectory: (dir: string) => void;
  validateProjectDirectory: (dir: string) => Promise<{ isValid: boolean; message?: string }>;
  clearHistory: () => void;
  removeHistoryItem: (dir: string) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectDirectory, setProjectDirectoryState] = useState("");

  useEffect(() => {
    const savedDir = localStorage.getItem(GLOBAL_PROJECT_DIR_KEY);
    if (savedDir) setProjectDirectoryState(savedDir);
  }, []);

  const setProjectDirectory = (dir: string) => {
    setProjectDirectoryState(dir);
    // Store in localStorage for global access
    if (dir) {
      localStorage.setItem(GLOBAL_PROJECT_DIR_KEY, dir);
      // Also add to history
      addToHistory(dir);
    } else {
      localStorage.removeItem(GLOBAL_PROJECT_DIR_KEY);
    }
  };

  const validateProjectDirectory = async (dir: string): Promise<{ isValid: boolean; message?: string }> => {
    if (!dir?.trim()) {
      return { isValid: false, message: "Directory path cannot be empty" };
    }

    try {
      // We'll use the readDirectoryAction which is already set up to validate directories
      // This is an indirect way to check directory validity - in a real implementation, 
      // we might want a dedicated validation endpoint
      // For now we'll return a mock success - this would be replaced with actual validation
      return { isValid: true };
    } catch (error) {
      return { 
        isValid: false, 
        message: error instanceof Error ? error.message : "Failed to validate directory" 
      };
    }
  };

  const addToHistory = (dir: string) => {
    if (!dir?.trim()) return;

    try {
      const storedHistory = localStorage.getItem(PROJECT_DIR_HISTORY_KEY);
      let history: string[] = storedHistory ? JSON.parse(storedHistory) : [];
      
      // Add to front, remove duplicates, limit size
      history = [dir, ...history.filter(item => item !== dir)].slice(0, MAX_PROJECT_DIR_HISTORY);
      
      localStorage.setItem(PROJECT_DIR_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      console.error("Failed to add to project directory history:", e);
    }
  };

  const clearHistory = () => {
    try {
      localStorage.removeItem(PROJECT_DIR_HISTORY_KEY);
    } catch (e) {
      console.error("Failed to clear project directory history:", e);
    }
  };

  const removeHistoryItem = (dir: string) => {
    try {
      const storedHistory = localStorage.getItem(PROJECT_DIR_HISTORY_KEY);
      if (!storedHistory) return;

      const history: string[] = JSON.parse(storedHistory);
      const updatedHistory = history.filter(item => item !== dir);
      
      localStorage.setItem(PROJECT_DIR_HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (e) {
      console.error("Failed to remove item from project directory history:", e);
    }
  };

  return (
    <ProjectContext.Provider value={{ 
      projectDirectory, 
      setProjectDirectory,
      validateProjectDirectory,
      clearHistory,
      removeHistoryItem
    }}>
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
