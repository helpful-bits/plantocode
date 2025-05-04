"use client";

import { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from "react";
// TODO: Fix the missing database context module
// import { useDatabase } from "./database-context";
import { normalizePath } from "@/lib/path-utils";
import { GLOBAL_PROJECT_DIR_KEY } from "@/lib/constants";
import { useNotification } from "./notification-context";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";
import { debounce } from "@/lib/utils/debounce";

// Helper function to get localStorage key for active session based on project directory
const getLocalStorageKeyForActiveSession = (projectDirectory: string) => 
  `activeSessionId-${projectDirectory}`;

interface ProjectContextType {
  projectDirectory: string;
  setProjectDirectory: (dir: string) => void;
  isLoading: boolean;
  error: string | null;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null, currentProjectDirectory?: string) => void;
}

// Default context values
const defaultContextValue: ProjectContextType = {
  projectDirectory: "",
  setProjectDirectory: () => {},
  isLoading: true,
  error: null,
  activeSessionId: null,
  setActiveSessionId: () => {}
};

const ProjectContext = createContext<ProjectContextType>(defaultContextValue);

// Track calls to project directory and session ID changes
const projectDirChanges = new Map<string, { count: number, lastChange: number, stack: string }>();
const sessionIdChanges = new Map<string, { count: number, lastChange: number, stack: string }>();

// Function to track and log API call patterns
const trackAPICall = (
  callType: 'projectDir' | 'sessionId', 
  key: string,
  details: {stack?: string} = {}
) => {
  const trackerMap = callType === 'projectDir' ? projectDirChanges : sessionIdChanges;
  const now = Date.now();
  
  if (!trackerMap.has(key)) {
    trackerMap.set(key, { 
      count: 1, 
      lastChange: now, 
      stack: details.stack || new Error().stack || 'unknown' 
    });
    return;
  }
  
  const entry = trackerMap.get(key)!;
  entry.count++;
  
  // Calculate time since last change
  const timeSinceLastChange = now - entry.lastChange;
  
  // If calls are happening too quickly, log detailed info
  if (timeSinceLastChange < 5000 && entry.count > 3) {
    console.warn(`[ProjectContext] Frequent ${callType} changes detected for key "${key}":`);
    console.warn(`  - ${entry.count} changes`);
    console.warn(`  - Last change: ${timeSinceLastChange}ms ago`);
    console.warn(`  - Current call stack: ${details.stack || new Error().stack}`);
    console.warn(`  - Initial call stack: ${entry.stack}`);
  }
  
  // Update last change time
  entry.lastChange = now;
  
  // Reset count after 30 seconds of inactivity
  if (timeSinceLastChange > 30000) {
    entry.count = 1;
    entry.stack = details.stack || new Error().stack || 'unknown';
  }
};

export function ProjectProvider({ children }: { children: ReactNode }) {
  // TODO: Fix the database context issue
  // const { repository } = useDatabase();
  const { showNotification } = useNotification();
  
  // Local state
  const [projectDirectory, setProjectDirectoryState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track the storage key to ensure it updates when project directory changes
  const storageKey = getLocalStorageKeyForActiveSession(projectDirectory || "none");
  
  // Use localStorage for activeSessionId with dynamic key based on project directory
  const [activeSessionId, setActiveSessionIdLS] = useLocalStorage<string | null>(
    storageKey, 
    null
  );
  
  // Refs
  const lastProjectDirChangeRef = useRef<number>(0);
  const PROJECT_DIR_CHANGE_COOLDOWN = 5000; // 5 second cooldown
  
  // Debounced localStorage setter to avoid rapid subsequent writes
  const debouncedSetGlobalProjectDir = useRef(
    debounce((dir: string) => {
      try {
        if (typeof window !== 'undefined') {
          console.log(`[ProjectContext] Debounced localStorage update for project directory: ${dir}`);
          localStorage.setItem(GLOBAL_PROJECT_DIR_KEY, dir);
        }
      } catch (err) {
        console.error('[ProjectContext] Error in debounced localStorage update:', err);
      }
    }, 1000) // 1 second debounce
  ).current;
  
  // Load initial project directory
  useEffect(() => {
    let isMounted = true;
    
    const loadInitialData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log(`[ProjectContext] Loading initial project directory...`);
        
        // Load project directory from localStorage
        const cachedDir = typeof window !== 'undefined' ? localStorage.getItem(GLOBAL_PROJECT_DIR_KEY) : null;
        
        // Safety check for component unmount during async operation
        if (!isMounted) return;
        
        if (cachedDir) {
          try {
            const normalizedDir = normalizePath(cachedDir);
            console.log(`[ProjectContext] Found cached project directory: ${normalizedDir}`);
            setProjectDirectoryState(normalizedDir);
            
            // The activeSessionId will be loaded automatically by the useLocalStorage hook
            // based on the localStorage key for this project directory
          } catch (pathErr) {
            console.error(`[ProjectContext] Error normalizing path:`, pathErr);
            setError(`Invalid project directory format: ${cachedDir}`);
          }
        } else {
          console.log(`[ProjectContext] No cached project directory found`);
        }
      } catch (err) {
        console.error(`[ProjectContext] Error loading initial data:`, err);
        if (isMounted) {
          setError(`Failed to load project data: ${err instanceof Error ? err.message : String(err)}`);
          
          // Show notification for the error
          showNotification({
            title: "Error",
            message: `Failed to load project data: ${err instanceof Error ? err.message : String(err)}`,
            type: "error"
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    
    loadInitialData();
    
    // Cleanup function to prevent state updates if unmounted
    return () => {
      isMounted = false;
    };
  }, [showNotification]);
  
  // Set project directory with persistence
  const setProjectDirectory = useCallback(async (dir: string) => {
    if (!dir) return;
    
    const now = Date.now();
    const lastChange = lastProjectDirChangeRef.current;
    
    // Prevent rapid changes (debounce)
    if (now - lastChange < PROJECT_DIR_CHANGE_COOLDOWN) {
      console.log(`[ProjectContext] Ignoring rapid project directory change: ${dir}`);
      return;
    }
    
    lastProjectDirChangeRef.current = now;
    
    try {
      // Normalize the path
      const normalizedDir = normalizePath(dir);
      console.log(`[ProjectContext] Setting project directory: ${normalizedDir}`);
      
      // Save current active session before switching projects
      // Note: We rely on SessionManager to handle saving the session
      // before initiating the project change, rather than doing it here
      
      // Before changing project, clear active session ID for the new directory
      if (typeof window !== 'undefined') {
        const newStorageKey = getLocalStorageKeyForActiveSession(normalizedDir);
        // Explicitly set to null to avoid loading a potentially stale session
        localStorage.removeItem(newStorageKey);
        console.log(`[ProjectContext] Cleared localStorage active session for new project directory: ${normalizedDir}`);
      }
      
      // Update state for immediate UI response
      setProjectDirectoryState(normalizedDir);
      
      // Use debounced function for localStorage update to prevent rapid writes
      debouncedSetGlobalProjectDir(normalizedDir);
      
    } catch (err) {
      console.error(`[ProjectContext] Error setting project directory:`, err);
      setError(`Failed to set project directory: ${err instanceof Error ? err.message : String(err)}`);
      
      showNotification({
        title: "Error",
        message: `Failed to set project directory: ${err instanceof Error ? err.message : String(err)}`,
        type: "error"
      });
    }
  }, [showNotification, debouncedSetGlobalProjectDir]);
  
  // Set active session ID with persistence
  const setActiveSessionId = useCallback((id: string | null, currentProjectDirectory?: string) => {
    // Add validation for id (allow null but reject objects)
    if (id !== null && typeof id !== 'string') {
      console.error('[ProjectContext] Invalid sessionId type:', typeof id, id);
      showNotification({
        title: "Error",
        message: "Cannot set active session: invalid session ID type",
        type: "error"
      });
      return;
    }
    
    const effectiveProjectDir = currentProjectDirectory || projectDirectory;
    const callStack = new Error().stack;
    
    // Track this API call
    trackAPICall('sessionId', `${effectiveProjectDir}-${id}`, { stack: callStack });
    
    if (!effectiveProjectDir) {
      console.log(`[ProjectContext] Cannot set active session: no project directory`);
      showNotification({
        title: "Warning",
        message: "Cannot set active session: no project directory selected",
        type: "warning"
      });
      return;
    }
    
    try {
      console.log(`[ProjectContext] Setting active session ID: ${id || 'null'} at ${new Date().toISOString()}`);
      
      // If the current projectDirectory matches the effectiveProjectDir (most common case),
      // just use the hook setter which handles the current project directory correctly
      if (!currentProjectDirectory || currentProjectDirectory === projectDirectory) {
        setActiveSessionIdLS(id);
        console.log(`[ProjectContext] Updated active session via localStorage hook: ${id || 'null'}`);
      } else {
        // For a different project directory, we should use a more reliable method
        // Consider using saveCachedState directly here if needed in the future
        console.warn(`[ProjectContext] Setting active session for a different project directory is not recommended.`);
        console.warn(`[ProjectContext] For proper session switching, change projectDirectory first with setProjectDirectory().`);
        
        // Still use the hook setter which handles the current project's context
        setActiveSessionIdLS(id); 
      }
    } catch (err) {
      console.error(`[ProjectContext] Error setting active session ID:`, err);
      
      showNotification({
        title: "Error",
        message: `Failed to set active session: ${err instanceof Error ? err.message : String(err)}`,
        type: "error"
      });
    }
  }, [projectDirectory, setActiveSessionIdLS, showNotification]);
  
  return (
    <ProjectContext.Provider
      value={{
        projectDirectory,
        setProjectDirectory,
        isLoading,
        error,
        activeSessionId,
        setActiveSessionId
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}
