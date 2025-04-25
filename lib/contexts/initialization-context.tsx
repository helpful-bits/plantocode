"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useDatabase } from "./database-context";
import { GLOBAL_PROJECT_DIR_KEY } from "@/lib/constants";
import { normalizePath } from "@/lib/path-utils";
import { sessionSyncService } from '@/lib/services/session-sync-service';

export type InitStage = 
  | 'database_init'     // Database is initializing
  | 'project_loading'   // Loading project directory from URL or storage
  | 'session_loading'   // Loading session data for the project
  | 'ready';            // Application is ready

export type ProjectSource = 
  | 'url'      // Project directory came from URL parameter
  | 'storage'  // Project directory loaded from persistent storage
  | 'picker'   // User selected project directory manually
  | null;      // No source yet

interface InitializationContextType {
  stage: InitStage;
  error: string | null;
  projectSource: ProjectSource;
  projectDirectory: string | null;
  activeSessionId: string | null;
  isLoading: boolean;
  
  // Actions
  setProjectDirectory: (dir: string, source?: ProjectSource) => Promise<void>;
  setActiveSessionId: (sessionId: string | null) => Promise<void>;
  retryInitialization: () => Promise<void>;
  clearError: () => void;
}

const defaultContext: InitializationContextType = {
  stage: 'database_init',
  error: null,
  projectSource: null,
  projectDirectory: null,
  activeSessionId: null,
  isLoading: true,
  
  setProjectDirectory: async () => {},
  setActiveSessionId: async () => {},
  retryInitialization: async () => {},
  clearError: () => {},
};

const InitializationContext = createContext<InitializationContextType>(defaultContext);

export function InitializationProvider({ children }: { children: ReactNode }) {
  // State
  const [stage, setStage] = useState<InitStage>('database_init');
  const [error, setError] = useState<string | null>(null);
  const [projectSource, setProjectSource] = useState<ProjectSource>(null);
  const [projectDirectory, setProjectDirectoryState] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Database context
  const { repository, isInitialized: databaseInitialized } = useDatabase();
  
  // Navigation hooks
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Refs for preventing race conditions
  const locks = useRef({
    projectUpdate: false,
    sessionUpdate: false,
    urlUpdate: false,
  });
  
  const initializationAttempted = useRef(false);
  
  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  // Set project directory with locking mechanism
  const setProjectDirectory = useCallback(async (dir: string, source: ProjectSource = 'picker') => {
    if (locks.current.projectUpdate) {
      console.log("[Init] Project update already in progress, skipping");
      return;
    }
    
    locks.current.projectUpdate = true;
    setIsLoading(true);
    
    try {
      const normalizedDir = normalizePath(dir);
      console.log(`[Init] Setting project directory to ${normalizedDir} (source: ${source})`);
      
      // Update state
      setProjectDirectoryState(normalizedDir);
      setProjectSource(source);
      
      // Update URL only if not already being updated from URL
      if (source !== 'url' && !locks.current.urlUpdate) {
        locks.current.urlUpdate = true;
        
        // Create new URL with encoded path
        const params = new URLSearchParams(searchParams.toString());
        params.set("projectDir", encodeURIComponent(normalizedDir));
        
        const newUrl = `${pathname}?${params.toString()}`;
        router.replace(newUrl, { scroll: false });
        
        // Reset URL lock after a delay to ensure the replace completes
        setTimeout(() => {
          locks.current.urlUpdate = false;
        }, 200);
      }
      
      // Persist to database
      if (repository) {
        try {
          // Wait for the database operation to complete
          await repository.saveCachedState("global", GLOBAL_PROJECT_DIR_KEY, normalizedDir);
          
          // Clear active session when switching projects
          if (source === 'picker') {
            setActiveSessionIdState(null);
          }
        } catch (err) {
          console.error("[Init] Failed to save project directory to DB:", err);
          // Non-fatal error, continue
        }
      }
      
      // Advance to session loading stage
      setStage('session_loading');
    } catch (err) {
      console.error("[Init] Error setting project directory:", err);
      setError(`Failed to set project directory: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      locks.current.projectUpdate = false;
      setIsLoading(false);
    }
  }, [pathname, repository, router, searchParams]);
  
  // Set active session ID with locking mechanism
  const setActiveSessionId = useCallback(async (sessionId: string | null) => {
    if (locks.current.sessionUpdate || !projectDirectory) {
      console.log("[Init] Session update already in progress or no project directory, skipping");
      return;
    }
    
    locks.current.sessionUpdate = true;
    setIsLoading(true);
    
    try {
      console.log(`[Init] Setting active session ID to ${sessionId || 'null'}`);
      
      // Use the session synchronization service
      await sessionSyncService.queueOperation(
        'load',
        sessionId,
        async () => {
          // Update state
          setActiveSessionIdState(sessionId);
          
          // Persist to database
          if (repository && projectDirectory) {
            try {
              await repository.setActiveSession(projectDirectory, sessionId);
            } catch (err) {
              console.error("[Init] Failed to save active session ID to DB:", err);
              // Non-fatal error, continue
            }
          }
          
          // Mark as ready
          setStage('ready');
        },
        5 // Highest priority for initialization context
      );
    } catch (err) {
      console.error("[Init] Error setting active session ID:", err);
      setError(`Failed to set active session: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      locks.current.sessionUpdate = false;
      setIsLoading(false);
    }
  }, [projectDirectory, repository]);
  
  // Initial setup - Listen for database initialization
  useEffect(() => {
    if (databaseInitialized && repository && stage === 'database_init') {
      console.log("[Init] Database initialized, proceeding to project loading");
      setStage('project_loading');
    }
  }, [databaseInitialized, repository, stage]);
  
  // Monitor URL changes when in appropriate stages
  useEffect(() => {
    // Skip if we're updating the URL ourselves or we're not in ready state
    if (locks.current.urlUpdate || stage === 'database_init') {
      return;
    }
    
    const urlDirRaw = searchParams.get('projectDir');
    if (!urlDirRaw) return;
    
    const urlDir = decodeURIComponent(urlDirRaw);
    const normalizedUrlDir = normalizePath(urlDir);
    
    // Skip if it's the same as current directory
    if (normalizedUrlDir === projectDirectory) {
      return;
    }
    
    console.log(`[Init] Detected URL change to ${normalizedUrlDir}, updating project directory`);
    setProjectDirectory(normalizedUrlDir, 'url');
  }, [searchParams, stage, projectDirectory, setProjectDirectory]);
  
  // Load project on entering project_loading stage
  useEffect(() => {
    if (stage !== 'project_loading' || !repository || !databaseInitialized || initializationAttempted.current) {
      return;
    }
    
    initializationAttempted.current = true;
    
    const loadProjectDirectory = async () => {
      try {
        setIsLoading(true);
        
        // First priority: URL parameter
        const urlDirRaw = searchParams.get('projectDir');
        if (urlDirRaw) {
          const urlDir = decodeURIComponent(urlDirRaw);
          const normalizedUrlDir = normalizePath(urlDir);
          
          console.log("[Init] Loading project directory from URL:", normalizedUrlDir);
          await setProjectDirectory(normalizedUrlDir, 'url');
          return;
        }
        
        // Second priority: Database
        console.log("[Init] No URL parameter, checking database for last project");
        const savedDir = await repository.getCachedState("global", GLOBAL_PROJECT_DIR_KEY);
        
        if (savedDir) {
          console.log("[Init] Loading project directory from database:", savedDir);
          await setProjectDirectory(savedDir, 'storage');
          return;
        }
        
        // No project directory found, wait for user selection
        console.log("[Init] No project directory found, waiting for user selection");
        setStage('project_loading');
        setIsLoading(false);
      } catch (err) {
        console.error("[Init] Error loading project directory:", err);
        setError(`Failed to load project directory: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
      }
    };
    
    loadProjectDirectory();
  }, [repository, databaseInitialized, searchParams, stage, setProjectDirectory]);
  
  // Load session on entering session_loading stage
  useEffect(() => {
    if (stage !== 'session_loading' || !repository || !projectDirectory) {
      return;
    }
    
    const loadActiveSession = async () => {
      try {
        setIsLoading(true);
        
        console.log(`[Init] Loading active session for project: ${projectDirectory}`);
        
        // Use the session synchronization service
        await sessionSyncService.queueOperation(
          'load',
          null, // Not tied to a specific session yet
          async () => {
            const sessionId = await repository.getActiveSessionId(projectDirectory);
            
            if (sessionId) {
              console.log(`[Init] Active session found: ${sessionId}`);
              
              // Verify session exists
              const session = await repository.getSession(sessionId);
              if (session) {
                setActiveSessionIdState(sessionId);
                console.log(`[Init] Session ${sessionId} loaded successfully`);
              } else {
                console.warn(`[Init] Active session ${sessionId} not found in DB`);
                // Reset active session in DB since it doesn't exist
                await repository.setActiveSession(projectDirectory, null);
                setActiveSessionIdState(null);
              }
            } else {
              console.log("[Init] No active session for this project");
              setActiveSessionIdState(null);
            }
            
            // Mark as ready
            setStage('ready');
          },
          5 // Highest priority for initialization context
        );
      } catch (err) {
        console.error("[Init] Error loading active session:", err);
        setError(`Failed to load active session: ${err instanceof Error ? err.message : String(err)}`);
        // Still mark as ready, just without a session
        setStage('ready');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadActiveSession();
  }, [repository, projectDirectory, stage]);
  
  // Retry initialization
  const retryInitialization = useCallback(async () => {
    console.log("[Init] Retrying initialization");
    setError(null);
    initializationAttempted.current = false;
    
    if (!databaseInitialized) {
      setStage('database_init');
    } else if (!projectDirectory) {
      setStage('project_loading');
    } else {
      setStage('session_loading');
    }
  }, [databaseInitialized, projectDirectory]);
  
  // Context value
  const contextValue: InitializationContextType = {
    stage,
    error,
    projectSource,
    projectDirectory,
    activeSessionId,
    isLoading,
    
    setProjectDirectory,
    setActiveSessionId,
    retryInitialization,
    clearError,
  };
  
  return (
    <InitializationContext.Provider value={contextValue}>
      {children}
    </InitializationContext.Provider>
  );
}

// Hook for consuming the context
export function useInitialization() {
  const context = useContext(InitializationContext);
  
  if (context === undefined) {
    throw new Error("useInitialization must be used within an InitializationProvider");
  }
  
  return context;
} 