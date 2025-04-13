"use client";

import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import { GLOBAL_PROJECT_DIR_KEY, PROJECT_DIR_HISTORY_KEY, MAX_PROJECT_DIR_HISTORY, PROJECT_DIR_HISTORY_CACHE_KEY } from "@/lib/constants";
import { useDatabase } from "./database-context";

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
  const { repository } = useDatabase();

  // Load project directory from database on mount
  useEffect(() => {
    const loadProjectDirectory = async () => {
      try {
        // Load from database
        const savedDir = await repository.getCachedState("global", "global", GLOBAL_PROJECT_DIR_KEY);
        
        if (savedDir) {
          setProjectDirectoryState(savedDir);
        }
      } catch (e) {
        console.error("Failed to load project directory:", e);
      }
    };
    
    loadProjectDirectory();
  }, [repository]);

  const setProjectDirectory = useCallback(async (dir: string) => {
    setProjectDirectoryState(dir);
    
    try {
      // Store in database for global access
      if (dir) {
        // Save to database
        await repository.saveCachedState("global", "global", GLOBAL_PROJECT_DIR_KEY, dir);
        
        // Also add to history
        addToHistory(dir);
      } else {
        // Clear from database
        await repository.saveCachedState("global", "global", GLOBAL_PROJECT_DIR_KEY, "");
      }
    } catch (e) {
      console.error("Failed to save project directory:", e);
    }
  }, [repository]);

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

  const addToHistory = useCallback(async (dir: string) => {
    if (!dir?.trim()) return;

    try {
      // Load from database
      const historyStr = await repository.getCachedState("global", "global", PROJECT_DIR_HISTORY_CACHE_KEY);
      
      // Parse history or initialize empty array
      let history: string[] = historyStr ? JSON.parse(historyStr) : [];
      
      // Add to front, remove duplicates, limit size
      history = [dir, ...history.filter(item => item !== dir)].slice(0, MAX_PROJECT_DIR_HISTORY);
      
      // Save to database
      await repository.saveCachedState("global", "global", PROJECT_DIR_HISTORY_CACHE_KEY, JSON.stringify(history));
    } catch (e) {
      console.error("Failed to add to project directory history:", e);
    }
  }, [repository]);

  const clearHistory = useCallback(async () => {
    try {
      // Clear from database
      await repository.saveCachedState("global", "global", PROJECT_DIR_HISTORY_CACHE_KEY, "[]");
    } catch (e) {
      console.error("Failed to clear project directory history:", e);
    }
  }, [repository]);

  const removeHistoryItem = useCallback(async (dir: string) => {
    try {
      // Get history from database
      const historyStr = await repository.getCachedState("global", "global", PROJECT_DIR_HISTORY_CACHE_KEY);
      
      if (!historyStr) return;
      
      const history: string[] = JSON.parse(historyStr);
      const updatedHistory = history.filter(item => item !== dir);
      
      // Save updated history to database
      await repository.saveCachedState("global", "global", PROJECT_DIR_HISTORY_CACHE_KEY, JSON.stringify(updatedHistory));
    } catch (e) {
      console.error("Failed to remove item from project directory history:", e);
    }
  }, [repository]);

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
