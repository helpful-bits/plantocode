"use client";
import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from "react";
import { GLOBAL_PROJECT_DIR_KEY } from "@/lib/constants"; // Keep GLOBAL_PROJECT_DIR_KEY import
import { useDatabase } from "./database-context"; // Import useDatabase hook
 
interface ProjectContextType {
  projectDirectory: string;
  setProjectDirectory: (dir: string) => void;
 } // Keep ProjectContextType interface

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) { // Keep ProjectProvider component
  const [projectDirectory, setProjectDirectoryState] = useState("");
  const { repository } = useDatabase(); // Use the repository from context
  const { isInitialized } = useDatabase(); // Use isInitialized hook
  const loadedRef = useRef(false); // Reference to track if we've loaded the project directory
  
  // Load project directory from DB on mount
  useEffect(() => {
    // Only load once when initialized and not already loaded
    if (isInitialized && !loadedRef.current) {
      const loadProjectDirectory = async () => {
        console.log("[ProjectContext] Attempting to load global project directory from DB");
        try { // Use try/catch block
          // Load from database
          const savedDir = await repository.getCachedState("global", "global", GLOBAL_PROJECT_DIR_KEY); // Using global scope
          
          if (savedDir) {
            setProjectDirectoryState(savedDir);
          }
          // Log loaded directory
          console.log("[ProjectContext] Loaded global project directory:", savedDir || "(none)"); // Added log
          
          // Mark as loaded
          loadedRef.current = true;
        } catch (e) {
          // It's okay if we can't load - we'll just start with an empty directory
          console.error("Failed to load project directory:", e);
          // Still mark as loaded to prevent repeated failing attempts
          loadedRef.current = true;
        }
      };
      
      loadProjectDirectory();
    }
  }, [repository, isInitialized]); // Dependencies

  const setProjectDirectory = useCallback(async (dir: string) => {
    const trimmedDir = dir.trim(); // Trim whitespace
    setProjectDirectoryState(trimmedDir); // Set state with trimmed dir
    console.log(`[ProjectContext] Setting project directory: ${trimmedDir || '(cleared)'}`);
    
    try {
      // Store in database for global access
      if (trimmedDir) {
        // Save to database, using 'global' context
        await repository.saveCachedState("global", "global", GLOBAL_PROJECT_DIR_KEY, trimmedDir);
      }
    } catch (e) {
      console.error("Failed to save project directory to global cache:", e);
    }
    // History logic is now handled within ProjectDirectorySelector
  }, [repository]);
  
  return (
    <ProjectContext.Provider value={{ 
      projectDirectory, setProjectDirectory
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
