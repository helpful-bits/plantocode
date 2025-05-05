"use client";

import { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from "react";
// TODO: Fix the missing database context module
// import { useDatabase } from "./database-context";
import { normalizePath } from "@/lib/path-utils";
import { GLOBAL_PROJECT_DIR_KEY } from "@/lib/constants";
import { useNotification } from "./notification-context";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";
import { debounce } from "@/lib/utils/debounce";
import sessionSyncService from '@/lib/services/session-sync-service';
import * as apiHandler from '@/lib/services/session-sync/api-handler';

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
  isSwitchingSession: boolean;
  setIsSwitchingSession: (isSwitching: boolean) => void;
}

// Default context values
const defaultContextValue: ProjectContextType = {
  projectDirectory: "",
  setProjectDirectory: () => {},
  isLoading: true,
  error: null,
  activeSessionId: null,
  setActiveSessionId: () => {},
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
  
  // Local state
  const [projectDirectory, setProjectDirectoryState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSwitchingSession, setIsSwitchingSession] = useState<boolean>(false);
  
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
  
  // Set active session ID with persistence and server sync
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
    
    // We now only support setting the active session for the current project directory
    // Cross-project updates should be managed at a higher level
    if (currentProjectDirectory && currentProjectDirectory !== projectDirectory) {
      console.warn(`[ProjectContext] Cross-project session updates are no longer supported. Ignoring update for ${currentProjectDirectory}.`);
      return;
    }
    
    const timestamp = new Date().toISOString();
    
    // Check if the incoming ID matches the current ID to prevent redundant updates
    if (id === activeSessionId) {
      console.log(`[ProjectContext][${timestamp}] Skipping active session update - same ID (${id || 'null'})`);
      return;
    }
    
    // For debugging only - no need to track extensively in production
    if (process.env.NODE_ENV === 'development') {
      const callStack = new Error().stack;
      trackAPICall('sessionId', `${projectDirectory}-${id}`, { stack: callStack });
    }
    
    if (!projectDirectory) {
      console.log(`[ProjectContext][${timestamp}] Cannot set active session: no project directory`);
      showNotification({
        title: "Warning",
        message: "Cannot set active session: no project directory selected",
        type: "warning"
      });
      return;
    }
    
    try {
      console.log(`[ProjectContext][${timestamp}] Setting active session ID: ${id || 'null'}`);
      
      // Generate a unique operation ID for tracking
      const operationId = `set_active_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Check if this is part of a switching operation - if so, increase priority
      // by setting local state with a higher priority flag
      const isSwitchingOperation = isSwitchingSession;
      
      // Update local state immediately for a responsive UI
      // The third parameter is a priority flag (added in useLocalStorage hook)
      // When switching sessions, we want to bypass rate limiting
      setActiveSessionIdLS(id, undefined, isSwitchingOperation);
      console.log(`[ProjectContext][${timestamp}] Updated local active session via localStorage hook: ${id || 'null'} (priority: ${isSwitchingOperation})`);
      
      // Inform the sync service about the session change
      if (id !== activeSessionId) {
        try {
          const previousSessionId = activeSessionId;
          console.log(`[ProjectContext][${timestamp}] Marking session ${id || 'null'} as switching target (previous: ${previousSessionId || 'null'})`);
          sessionSyncService.markSessionSwitching(id, previousSessionId);
        } catch (markError) {
          // Safely ignore errors with markSessionSwitching
          console.warn(`[ProjectContext][${timestamp}] Unable to mark session switching (non-critical):`, markError);
        }
      }
      
      // Update server state in background with priority flag for session switches
      try {
        // Fire and forget - don't await this call to keep UI responsive
        // Pass along the switching flag to the API handler to give it higher priority
        apiHandler.setActiveSession(projectDirectory, id, operationId, isSwitchingSession)
          .then(() => {
            console.log(`[ProjectContext][${timestamp}] Successfully synced active session to server: ${id || 'null'}`);
          })
          .catch((syncError: any) => {
            console.error(`[ProjectContext][${timestamp}] Error syncing active session to server:`, syncError);
            // Don't show notification for background sync failures to avoid user confusion
          });
        
        console.log(`[ProjectContext][${timestamp}] Initiated background sync of active session to server: ${id || 'null'}`);
      } catch (syncError) {
        console.error(`[ProjectContext][${timestamp}] Error setting up background sync:`, syncError);
        // Continue with local state update even if server sync setup fails
      }
    } catch (err) {
      console.error(`[ProjectContext][${timestamp}] Error setting active session ID:`, err);
      
      showNotification({
        title: "Error",
        message: `Failed to set active session: ${err instanceof Error ? err.message : String(err)}`,
        type: "error"
      });
    }
  }, [projectDirectory, setActiveSessionIdLS, showNotification, activeSessionId, isSwitchingSession]);
  
  // Listen for activeSessionId changes (for logging purposes only)
  // The actual API calls are now handled in the setActiveSessionId function
  useEffect(() => {
    if (!projectDirectory || !activeSessionId) return;
    
    if (typeof window !== 'undefined') {
      try {
        const timestamp = new Date().toISOString();
        console.log(`[ProjectContext][${timestamp}] Active session ID changed: ${activeSessionId}`);
        // No redundant API calls here - setActiveSessionId already handles server syncing
      } catch (error) {
        console.error(`[ProjectContext] Error in sessionId change effect:`, error);
      }
    }
  }, [projectDirectory, activeSessionId]);
  
  return (
    <ProjectContext.Provider
      value={{
        projectDirectory,
        setProjectDirectory,
        isLoading,
        error,
        activeSessionId,
        setActiveSessionId,
        isSwitchingSession,
        setIsSwitchingSession
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
