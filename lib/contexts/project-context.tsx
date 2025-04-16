"use client";

import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { GLOBAL_PROJECT_DIR_KEY } from "@/lib/constants";
import { useDatabase } from "./database-context"; // Keep database-context import

interface ProjectContextType {
  projectDirectory: string;
  setProjectDirectory: (dir: string) => void;
 }

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectDirectory, setProjectDirectoryState] = useState("");
  const { repository } = useDatabase();
  const { isInitialized } = useDatabase(); // Use isInitialized hook
  const loadedRef = useRef(false); // Track if initial load happened
  const searchParams = useSearchParams();
  const isUpdatingRef = useRef(false); // Track if currently updating to prevent loops

  // Load project directory from URL or DB on mount
  useEffect(() => {
    // Only load once when initialized and not already loaded
    if (isInitialized && !loadedRef.current && !isUpdatingRef.current) {
      const loadProjectDirectory = async () => {
        try { // Use try/catch block
          // First priority: URL parameter
          const urlDirRaw = searchParams.get('projectDir');
          const urlDir = urlDirRaw ? decodeURIComponent(urlDirRaw) : null;

          if (urlDir) {
            setProjectDirectoryState(urlDir);
            console.log("[ProjectContext] Loaded project directory from URL:", urlDir);
            loadedRef.current = true; // Mark as loaded from URL
            return; // Don't check DB if URL provides it
          }

          // Second priority: database cache (only if URL is not available)
          if (repository) {
            const savedDir = await repository.getCachedState("global", GLOBAL_PROJECT_DIR_KEY);
            
            // Make sure the saved directory isn't the key name itself and is a valid string
            if (savedDir && 
                typeof savedDir === 'string' && 
                savedDir.trim() !== '' && 
                savedDir !== GLOBAL_PROJECT_DIR_KEY) {
              setProjectDirectoryState(savedDir);
              console.log("[ProjectContext] Loaded global project directory from DB:", savedDir);
            }
          }
          
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
  }, [repository, isInitialized, searchParams]); // Keep dependencies

  const setProjectDirectory = useCallback(async (dir: string) => {
    if (isUpdatingRef.current) return; // Prevent recursive updates
    
    const trimmedDir = dir?.trim() || "";

    // Only update state and save if the directory actually changed
    if (trimmedDir !== projectDirectory) {
      isUpdatingRef.current = true; // Set flag to prevent recursive updates
      
      try {
        setProjectDirectoryState(trimmedDir); // Set state with trimmed dir
        console.log(`[ProjectContext] Setting project directory: ${trimmedDir || '(cleared)'}`);
      
        // Store in database for global access
        if (repository && isInitialized) { // Ensure repo is initialized before saving
          // Save to database, using 'global' context
          await repository.saveCachedState("global", GLOBAL_PROJECT_DIR_KEY, trimmedDir);
        }
      } catch (e) {
        console.error("Failed to save project directory to global cache:", e);
      } finally {
        // Reset the flag after a short delay to allow other updates to complete
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 50);
      }
    }
  }, [repository, projectDirectory, isInitialized]); // Keep dependencies
  
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
