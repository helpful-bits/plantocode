"use client";

import { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback, useMemo } from "react";
import { normalizePath } from "@/lib/path-utils";
import { GLOBAL_PROJECT_DIR_KEY } from "@/lib/constants";
import { useNotification } from "./notification-context";
import { useUILayout } from "./ui-layout-context";
import { getGenericCachedStateAction, saveGenericCachedStateAction } from "@/actions/project-settings-actions";

interface ProjectContextType {
  projectDirectory: string;
  setProjectDirectory: (dir: string) => void;
  isLoading: boolean;
  error: string | null;
  isSwitchingSession: boolean;
  setIsSwitchingSession: (isSwitching: boolean) => void;
}

// Default context values
const defaultContextValue: ProjectContextType = {
  projectDirectory: "",
  setProjectDirectory: () => {},
  isLoading: true,
  error: null,
  isSwitchingSession: false,
  setIsSwitchingSession: () => {}
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
  const { setAppInitializing } = useUILayout();

  // Local state
  const [projectDirectory, setProjectDirectoryState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSwitchingSession, setIsSwitchingSession] = useState<boolean>(false);

  // Refs
  const lastProjectDirChangeRef = useRef<number>(0);
  const PROJECT_DIR_CHANGE_COOLDOWN = 5000; // 5 second cooldown
  const hasInitializedRef = useRef<boolean>(false);
  
  // Function to save global project directory
  const saveGlobalProjectDir = async (dir: string) => {
    try {
      if (typeof window !== 'undefined') {
        console.log(`[ProjectContext] Saving project directory: ${dir}`);
        // Use the server action to save the state immediately
        const result = await saveGenericCachedStateAction(null, GLOBAL_PROJECT_DIR_KEY, dir);
        if (!result.isSuccess) {
          console.error(`[ProjectContext] Error saving global project directory:`, result.message);
        }
      }
    } catch (err) {
      console.error('[ProjectContext] Error in project directory update:', err);
    }
  };
  
  // Track initialization state to prevent circular dependencies
  const isInitialLoadingRef = useRef<boolean>(true);

  // Load initial project directory
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      // Set loading state
      setIsLoading(true);
      setError(null);

      try {
        // Load project directory directly, no delay
        const cachedResult = await getGenericCachedStateAction(null, GLOBAL_PROJECT_DIR_KEY);

        // Safety check for component unmount during async operation
        if (!isMounted) return;

        const cachedDir = cachedResult.isSuccess ? cachedResult.data : null;

        if (cachedDir) {
          try {
            const normalizedDir = normalizePath(cachedDir);
            console.log(`[ProjectContext] Found cached project directory: ${normalizedDir}`);

            // Set project directory, but ensure it doesn't trigger context cascades
            // if it's the same as what was already loaded during hot reload
            if (isInitialLoadingRef.current) {
              setProjectDirectoryState(normalizedDir);
              isInitialLoadingRef.current = false;
            } else {
              // Only update if it's actually different (prevents redundant renders during hot reload)
              if (projectDirectory !== normalizedDir) {
                setProjectDirectoryState(normalizedDir);
              } else {
                console.log(`[ProjectContext] Skipping redundant project directory update: ${normalizedDir}`);
              }
            }

            // Mark project as initialized
            hasInitializedRef.current = true;
          } catch (pathErr) {
            console.error(`[ProjectContext] Error normalizing path:`, pathErr);
            setError(`Invalid project directory format: ${cachedDir}`);
          }
        } else {
          console.log(`[ProjectContext] No cached project directory found`);
          // Mark initialization as completed even if no directory found
          isInitialLoadingRef.current = false;
          hasInitializedRef.current = true;
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
  }, [showNotification, projectDirectory]);
  
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
      // We don't need to manually manage session IDs anymore as they're handled by SessionContext
      
      // Update state for immediate UI response
      setProjectDirectoryState(normalizedDir);
      
      // Save the directory to the database
      await saveGlobalProjectDir(normalizedDir);

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
  
  // The setActiveSessionId method has been moved to SessionContext

  // Session ID management has been moved to SessionContext

  // Simple effect to maintain isSwitchingSession state
  useEffect(() => {
    // Always initialize to false by default
    setIsSwitchingSession(false);

    // No complex event handling or timeouts here anymore
    // SessionContext will be responsible for managing its own events
    // and this context will only track a simple boolean state
    // that can be used by components to show loading indicators
  }, [setIsSwitchingSession]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    projectDirectory,
    setProjectDirectory,
    isLoading,
    error,
    isSwitchingSession,
    setIsSwitchingSession
  }), [
    projectDirectory,
    setProjectDirectory,
    isLoading,
    error,
    isSwitchingSession,
    setIsSwitchingSession
  ]);

  return (
    <ProjectContext.Provider value={contextValue}>
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
