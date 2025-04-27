"use client";

import { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from "react";
import { useDatabase } from "./database-context";
import { normalizePath } from "@/lib/path-utils";
import { GLOBAL_PROJECT_DIR_KEY } from "@/lib/constants";
import { useNotification } from "./notification-context";

interface ProjectContextType {
  projectDirectory: string;
  setProjectDirectory: (dir: string) => void;
  isLoading: boolean;
  error: string | null;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
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

export function ProjectProvider({ children }: { children: ReactNode }) {
  // Keep the database reference for backward compatibility
  const { repository } = useDatabase();
  const { showNotification } = useNotification();
  
  // Local state
  const [projectDirectory, setProjectDirectoryState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  
  // Refs
  const lastProjectDirChangeRef = useRef<number>(0);
  const PROJECT_DIR_CHANGE_COOLDOWN = 5000; // 5 second cooldown
  
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
            
            // Fetch the active session ID from the API
            try {
              const response = await fetch(`/api/active-session?projectDirectory=${encodeURIComponent(normalizedDir)}`);
              
              if (response.ok) {
                const data = await response.json();
                if (isMounted) {
                  if (data.rateLimited) {
                    console.log(`[ProjectContext] Active session request was rate limited`);
                  } else {
                    console.log(`[ProjectContext] Fetched active session ID from API: ${data.sessionId || 'null'}`);
                    setActiveSessionIdState(data.sessionId);
                  }
                }
              } else {
                const data = await response.json().catch(() => ({}));
                console.error(`[ProjectContext] Error fetching active session from API: ${data.error || response.status}`);
                // Don't show notification here, as this is just initialization
              }
            } catch (sessionErr) {
              console.error(`[ProjectContext] Error fetching active session from API:`, sessionErr);
              // Don't block initialization if API call fails
            }
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
      
      // Update state first for immediate UI response
      setProjectDirectoryState(normalizedDir);
      
      // Clear active session ID when changing project
      setActiveSessionIdState(null);
      
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(GLOBAL_PROJECT_DIR_KEY, normalizedDir);
        console.log(`[ProjectContext] Saved project directory to localStorage`);
      
        // Explicitly clear the active session for this project via API
        try {
          const response = await fetch('/api/active-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              projectDirectory: normalizedDir, 
              sessionId: null 
            })
          });
          
          const data = await response.json();
          
          if (response.ok) {
            if (data.rateLimited) {
              console.log(`[ProjectContext] Request to clear active session was rate limited, but accepted`);
            } else {
              console.log(`[ProjectContext] Cleared active session for new project directory via API`);
            }
          } else {
            console.error(`[ProjectContext] Error clearing active session via API: ${data.error || response.status}`);
          }
        } catch (apiErr) {
          console.error(`[ProjectContext] Error calling active-session API:`, apiErr);
        }
      }
    } catch (err) {
      console.error(`[ProjectContext] Error setting project directory:`, err);
      setError(`Failed to set project directory: ${err instanceof Error ? err.message : String(err)}`);
      
      showNotification({
        title: "Error",
        message: `Failed to set project directory: ${err instanceof Error ? err.message : String(err)}`,
        type: "error"
      });
    }
  }, [showNotification]);
  
  // Set active session ID with persistence
  const setActiveSessionId = useCallback(async (id: string | null) => {
    if (!projectDirectory) {
      console.log(`[ProjectContext] Cannot set active session: no project directory`);
      showNotification({
        title: "Warning",
        message: "Cannot set active session: no project directory selected",
        type: "warning"
      });
      return;
    }
    
    try {
      console.log(`[ProjectContext] Setting active session ID: ${id || 'null'}`);
      
      // Update local state immediately for UI responsiveness
      setActiveSessionIdState(id);
      
      // Update the active session via API
      try {
        const response = await fetch('/api/active-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            projectDirectory, 
            sessionId: id 
          })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          if (data.rateLimited) {
            console.log(`[ProjectContext] Request was rate limited, but accepted`);
          } else {
            console.log(`[ProjectContext] Updated active session via API: ${id || 'null'}`);
          }
        } else {
          console.error(`[ProjectContext] API error: ${data.error || `Status ${response.status}`}`);
          
          showNotification({
            title: "Warning",
            message: `Failed to update active session in database: ${data.error || `API error ${response.status}`}`,
            type: "warning"
          });
        }
      } catch (apiErr) {
        console.error(`[ProjectContext] Error updating active session via API:`, apiErr);
        showNotification({
          title: "Warning",
          message: `Failed to update active session in database: ${apiErr instanceof Error ? apiErr.message : String(apiErr)}`,
          type: "warning"
        });
      }
    } catch (err) {
      console.error(`[ProjectContext] Error setting active session ID:`, err);
      setError(`Failed to set active session: ${err instanceof Error ? err.message : String(err)}`);
      
      showNotification({
        title: "Error",
        message: `Failed to set active session: ${err instanceof Error ? err.message : String(err)}`,
        type: "error"
      });
    }
  }, [projectDirectory, showNotification]);
  
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
  return useContext(ProjectContext);
}
