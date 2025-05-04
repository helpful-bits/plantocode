"use client";
// Add TypeScript declaration for the debugSessionState global function
declare global {
  interface Window {
    debugSessionState?: (sessionId: string) => void;
    sessionMonitor?: {
      record: (sessionId: string) => void;
    };
  }
}

import React, { useState, useEffect, useCallback, useRef, useTransition, memo, useMemo } from "react";
import { Session } from '@/types/session-types';
import { Save, Trash2, Plus, Loader2, Pencil, Check, X, RefreshCw, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useProject } from "@/lib/contexts/project-context";
import { normalizePath } from "@/lib/path-utils";
import { debounce } from "@/lib/utils/debounce";
import sessionSyncService from '@/lib/services/session-sync-service';
import { useNotification } from '@/lib/contexts/notification-context';
import {
  createSessionAction,
  deleteSessionAction,
  renameSessionAction,
  getSessionAction,
  getSessionsAction,
  saveSessionAction
} from '@/actions/session-actions';

export interface SessionManagerProps {
  projectDirectory: string;
  getCurrentSessionState: () => Omit<Session, "id" | "name" | "updatedAt">;
  onLoadSession: (session: Session) => void;
  activeSessionId: string | null;
  setActiveSessionIdExternally: (id: string | null) => void;
  onSessionNameChange: (name: string) => void;
  sessionInitialized: boolean;
  onSessionStatusChange?: (hasActiveSession: boolean) => void;
  onActiveSessionIdChange: (sessionId: string | null) => void;
}

// Helper function to generate UUID 
function generateUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Helper function to check if two session arrays are functionally equal
function sessionsAreEqual(sessionsA: Session[], sessionsB: Session[]): boolean {
  if (sessionsA.length !== sessionsB.length) return false;
  
  // Create maps for faster lookup
  const mapA = new Map(sessionsA.map(s => [s.id, s]));
  const mapB = new Map(sessionsB.map(s => [s.id, s]));
  
  // Check if all sessions in A exist in B with the same name
  for (const session of sessionsA) {
    const sessionB = mapB.get(session.id);
    if (!sessionB || sessionB.name !== session.name) {
      return false;
    }
  }
  
  // Check if all sessions in B exist in A
  for (const session of sessionsB) {
    if (!mapA.has(session.id)) {
      return false;
    }
  }
  
  return true;
}

const SessionManager = ({
  projectDirectory,
  getCurrentSessionState,
  onLoadSession,
  activeSessionId: externalActiveSessionId,
  setActiveSessionIdExternally,
  onSessionNameChange,
  sessionInitialized: externalSessionInitialized,
  onSessionStatusChange,
  onActiveSessionIdChange,
}: SessionManagerProps) => {
  const { activeSessionId: projectActiveSessionId, setActiveSessionId: setProjectActiveSessionId } = useProject();
  const { showNotification } = useNotification();
  
  const [isPending, startTransition] = useTransition();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionIdInternal] = useState<string | null>(externalActiveSessionId);
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingState, setIsSyncingState] = useState(false);
  const [isSwitchingSession, setIsSwitchingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editSessionNameInput, setEditSessionNameInput] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const lastSavedSessionIdRef = useRef<string | null>(null);
  const lastLoadedProjectDirRef = useRef<string | null>(null);
  
  // Track pending changes and loading state
  const pendingLoadRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const lastFetchTimeRef = useRef<number>(0);
  const MIN_FETCH_INTERVAL_MS = 5000; // 5 seconds
  
  // Sync with project context's active session
  useEffect(() => {
    if (projectActiveSessionId !== activeSessionId) {
      console.log(`[SessionManager] Syncing active session ID from project context: ${projectActiveSessionId || 'null'}`);
      setActiveSessionIdInternal(projectActiveSessionId);
      onActiveSessionIdChange(projectActiveSessionId);
    }
  }, [projectActiveSessionId, activeSessionId, onActiveSessionIdChange]);
  
  // Handle setting active session ID in context
  const updateActiveSessionInContext = useCallback((sessionId: string | null) => {
    if (!projectDirectory) {
      console.error('[SessionManager] Cannot update context: No project directory');
      return;
    }
    
    console.log(`[SessionManager] Updating active session ID in context: ${sessionId || 'null'}`);
    
    // Pass both the session ID and project directory to make sure we update the correct localStorage key
    // This ensures we're setting the active session for the current project context
    setProjectActiveSessionId(sessionId, projectDirectory);
    
    // Also update the active session in the generate prompt state
    setActiveSessionIdExternally(sessionId);
    
    // Keep internal state synchronized
    setActiveSessionIdInternal(sessionId);
  }, [projectDirectory, setProjectActiveSessionId, setActiveSessionIdExternally]);
  
  // Handle project directory changes specifically
  useEffect(() => {
    if (!projectDirectory) return;
    
    const normalizedDir = normalizePath(projectDirectory);
    const lastLoadedDir = lastLoadedProjectDirRef.current;
    
    if (lastLoadedDir && lastLoadedDir !== normalizedDir) {
      console.log(`[SessionManager] Project directory changed from "${lastLoadedDir}" to "${normalizedDir}"`);
      
      // Clear sessions state immediately when project changes
      setSessions([]);
      
      // Clear any pending operations that might be associated with the old project
      sessionSyncService.clearStuckSession(activeSessionId);
      
      // Reset loading flags for the new project
      hasLoadedOnceRef.current = false;
      pendingLoadRef.current = false;
    }
    
    // Update the reference
    lastLoadedProjectDirRef.current = normalizedDir;
  }, [projectDirectory, activeSessionId]);

  const loadSessions = useCallback(async () => {
    // Check if project directory exists
    if (!projectDirectory) {
      console.log(`[SessionManager] Skipping loadSessions: No project directory`);
      return;
    }
    
    // Check for pending operation
    if (pendingLoadRef.current) {
      console.log(`[SessionManager] Skipping loadSessions: Load already pending`);
      return;
    }
    
    // Check if minimum time interval has passed since last fetch
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;
    if (lastFetchTimeRef.current > 0 && timeSinceLastFetch < MIN_FETCH_INTERVAL_MS) {
      console.log(`[SessionManager] Throttling loadSessions: Last fetch was ${timeSinceLastFetch}ms ago (min interval: ${MIN_FETCH_INTERVAL_MS}ms)`);
      return;
    }
    
    const normalizedProjectDir = normalizePath(projectDirectory);
    console.log(`[SessionManager] Loading sessions for: ${normalizedProjectDir}`);
    
    // Set pending flag and update last fetch time
    pendingLoadRef.current = true;
    lastFetchTimeRef.current = now;
    
    // Throttle frequent calls by applying a small delay
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true);
    }
    
    try {
      const result = await getSessionsAction(normalizedProjectDir);
      
      if (result.isSuccess && Array.isArray(result.data)) {
        console.log(`[SessionManager] Loaded ${result.data.length} sessions for project: ${normalizedProjectDir}`);
      
        // Mark as loaded
        hasLoadedOnceRef.current = true;
        
        startTransition(() => {
          // Skip update if only timestamps changed (auto-saves)
          const sessionsData = result.data || [];
          if (sessionsData.length > 0 && sessionsAreEqual(sessionsData, sessions)) {
            console.log('[SessionManager] Sessions unchanged except for timestamps, skipping UI update');
            return;
          }
          
          if (sessionsData) {
            setSessions(sessionsData);
            setError(null);
            
            if (onSessionStatusChange) {
              onSessionStatusChange(!!activeSessionId || sessionsData.length > 0);
            }
          }
        });
      } else {
        throw new Error(result.message || "Failed to load sessions");
      }
    } catch (err) {
      console.error("[SessionManager] Failed to load sessions:", err);
      setError("Failed to load sessions");
      setSessions([]);
      
      showNotification({
        title: "Error",
        message: "Failed to load sessions",
        type: "error"
      });
      
      if (onSessionStatusChange) {
        onSessionStatusChange(false);
      }
      
      // Ensure loading is cleared on error
      hasLoadedOnceRef.current = true;
    } finally {
      setIsLoading(false);
      
      // Set a cooldown period before allowing the next load
      setTimeout(() => {
        pendingLoadRef.current = false;
      }, 2000); // 2 second cooldown
    }
  }, [projectDirectory, onSessionStatusChange, activeSessionId, showNotification, MIN_FETCH_INTERVAL_MS, sessions]);

  // Debounced load sessions function
  const debouncedLoadSessions = useMemo(() => debounce(loadSessions, 1000), [loadSessions]);

  // Initial load on mount and when projectDirectory changes
  useEffect(() => {
    if (!projectDirectory) return;
    
    const normalizedDir = normalizePath(projectDirectory);
    const lastLoaded = lastLoadedProjectDirRef.current;
    
    // Only log and check if the component wasn't just re-rendering
    if (lastLoaded !== normalizedDir) {
      console.log(`[SessionManager] Project directory changed or component mounted: ${projectDirectory}`);
      console.log(`[SessionManager] Project directory changed from "${lastLoaded || 'none'}" to "${normalizedDir}"`);
      
      // Use a timeout to avoid immediate triggers on mount
      // This helps separate the initial render triggering from actual directory changes
      const timer = setTimeout(() => {
        if (!pendingLoadRef.current) {
          loadSessions();
        }
      }, 100);
      
      return () => clearTimeout(timer);
    } else if (!pendingLoadRef.current && hasLoadedOnceRef.current === false) {
      // We need to load sessions if none are loaded yet
      console.log(`[SessionManager] Project directory unchanged but no sessions loaded: ${normalizedDir}`);
      const timer = setTimeout(() => {
        loadSessions();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [projectDirectory, loadSessions]);

  // Handle saving a session
  const handleSave = async () => {
    if (!sessionNameInput.trim()) {
      showNotification({
        title: "Error",
        message: "Please enter a session name",
        type: "error"
      });
      return;
    }
    
    if (!projectDirectory) {
      showNotification({
        title: "Error",
        message: "No project directory selected",
        type: "error"
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Prepare session data
      const sessionState = getCurrentSessionState();
      
      // Always generate a new UUID for a new session
      // This ensures we don't have conflicts with the database primary key
      const sessionId = generateUUID();
      
      // Create session using server action
      const result = await createSessionAction({
        id: sessionId,
        name: sessionNameInput,
        // Ensure current session state includes the project directory
        ...sessionState,
      });
      
      if (result.isSuccess && result.data) {
        // Update session list
        await loadSessions();
        
        // Set active session
        setActiveSessionIdInternal(sessionId);
        updateActiveSessionInContext(sessionId);
        
        // Update name in UI
        onSessionNameChange(sessionNameInput);
        
        // Clear input
        setSessionNameInput("");
        
        showNotification({
          title: "Success",
          message: "Session saved successfully",
          type: "success"
        });
      } else {
        throw new Error(result.message || "Failed to save session");
      }
    } catch (error) {
      console.error("[SessionManager] Error saving session:", error);
      
      showNotification({
        title: "Error",
        message: `Failed to save session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle opening the session name editor
  const startEditingSession = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditSessionNameInput(session.name || "");
  };

  // Handle canceling the session name edit
  const cancelEditing = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation();
    setEditingSessionId(null);
  };

  // Handle updating a session name
  const handleUpdateSessionName = async (sessionId: string) => {
    // Validate sessionId
    if (!sessionId || typeof sessionId !== 'string') {
      console.error(`[SessionManager] Invalid sessionId type: ${typeof sessionId}, value:`, sessionId);
      showNotification({
        title: "Error",
        message: "Invalid session ID format",
        type: "error"
      });
      return;
    }
    
    if (!editSessionNameInput.trim()) {
      showNotification({
        title: "Error",
        message: "Session name cannot be empty",
        type: "error"
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // First, update the local UI state immediately for a responsive feel
      const updatedSessions = sessions.map(session => 
        session.id === sessionId 
          ? { ...session, name: editSessionNameInput } 
          : session
      );
      
      // Update the sessions list in the UI
      setSessions(updatedSessions);
      
      // If this is the active session, update the name in UI
      if (sessionId === activeSessionId) {
        onSessionNameChange(editSessionNameInput);
      }
      
      // Clear editing state
      setEditingSessionId(null);
      
      // Now update on the server in the background
      const result = await renameSessionAction(sessionId, editSessionNameInput);
      
      if (result.isSuccess) {
        // No need to reload sessions, we've already updated the UI
        showNotification({
          title: "Success",
          message: "Session renamed successfully",
          type: "success"
        });
      } else {
        // Revert the UI changes if the server update failed
        await loadSessions();
        throw new Error(result.message || "Failed to rename session");
      }
    } catch (error) {
      console.error("[SessionManager] Error updating session name:", error);
      
      // Reload sessions to ensure UI is in sync with server
      await loadSessions();
      
      showNotification({
        title: "Error",
        message: `Failed to rename session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle deleting a session
  const handleDelete = async (sessionId: string) => {
    // Validate sessionId
    if (!sessionId || typeof sessionId !== 'string') {
      console.error(`[SessionManager] Invalid sessionId type: ${typeof sessionId}, value:`, sessionId);
      showNotification({
        title: "Error",
        message: "Invalid session ID format",
        type: "error"
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Delete session using server action
      const result = await deleteSessionAction(sessionId);
      
      if (result.isSuccess) {
        // If this was the active session, clear it from all relevant states
        if (sessionId === activeSessionId) {
          console.log(`[SessionManager] Active session ${sessionId} was deleted, clearing from context and state`);
          
          // Update context first - this will propagate to all components using the context
          updateActiveSessionInContext(null);
          
          // Update internal state
          setActiveSessionIdInternal(null);
          
          // Also update parent components
          onActiveSessionIdChange(null);
          onSessionNameChange("");
        } else {
          console.log(`[SessionManager] Deleted session ${sessionId} (not the active session)`);
        }
        
        // Reload sessions list
        await loadSessions();
        
        showNotification({
          title: "Success",
          message: "Session deleted successfully",
          type: "success"
        });
      } else {
        throw new Error(result.message || "Failed to delete session");
      }
    } catch (error) {
      console.error("[SessionManager] Error deleting session:", error);
      
      // Create a more user-friendly error message
      let errorMessage = "Failed to delete session";
      if (error instanceof Error) {
        if (error.message.includes("read-only mode") || error.message.includes("SQLITE_READONLY")) {
          errorMessage = "Cannot delete session: The database is in read-only mode. Please check file permissions.";
        } else {
          errorMessage = error.message;
        }
      }
      
      showNotification({
        title: "Error",
        message: errorMessage,
        type: "error"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle loading a session
  const currentSaveController = useRef<AbortController | null>(null);

  const handleLoadSession = async (session: Session) => {
    const startTime = Date.now();
    const startTimestamp = new Date(startTime).toISOString();
    console.log(`[SessionManager][${startTimestamp}] 🔄 SESSION SWITCH STARTED: Changing from ${activeSessionId || 'null'} to ${session.id} (${session.name})`);
    
    if (session.id === activeSessionId) {
      console.log(`[SessionManager] Session ${session.id} is already active, skipping load`);
      return;
    }
    
    // Validate that session.id is a string
    if (!session.id || typeof session.id !== 'string') {
      console.error(`[SessionManager] Invalid session ID type: ${typeof session.id}, value:`, session.id);
      showNotification({
        title: "Error",
        message: "Invalid session ID format",
        type: "error"
      });
      return;
    }
    
    try {
      // Set switching state immediately
      setIsSwitchingSession(true);
      console.log(`[SessionManager][${startTimestamp}] Step 1: Setting isSwitchingSession=true`);
      
      // Set syncing state to show loading indicator
      setIsSyncingState(true);
      console.log(`[SessionManager][${startTimestamp}] Step 2: Setting isSyncingState=true to display loading indicator`);
      
      // Cancel any previous session
      if (activeSessionId) {
        try {
          console.log(`[SessionManager][${startTimestamp}] Step 3: Saving and clearing previous active session: ${activeSessionId}`);
          
          // Simply use String for type safety
          const sessionIdStr = String(activeSessionId);
          
          // Abort any previous save operation that might still be in progress
          if (currentSaveController.current) {
            console.log(`[SessionManager][${startTimestamp}] Step 3.1: Aborting previous save operation for session ${sessionIdStr}`);
            currentSaveController.current.abort();
          }
          
          // Create a new controller for this save operation
          currentSaveController.current = new AbortController();
          const signal = currentSaveController.current.signal;
          console.log(`[SessionManager][${startTimestamp}] Step 3.2: Created new AbortController for save operation of session ${sessionIdStr}`);
          
          // Get current state from parent component
          const currentSessionState = getCurrentSessionState();
          
          // Find the session details from the sessions state to get the name
          const currentSession = sessions.find(s => s.id === sessionIdStr);
          const currentSessionName = currentSession?.name || "Untitled Session";
          
          // Save the current session state immediately
          console.log(`[SessionManager][${startTimestamp}] Step 3.3: Immediately saving state of current session ${sessionIdStr} before switching`);
          console.log(`[SessionManager][${startTimestamp}] Session state summary:`, {
            name: currentSessionName,
            taskDescriptionLength: currentSessionState.taskDescription?.length || 0,
            hasIncludedFiles: !!currentSessionState.includedFiles?.length,
            includedFilesCount: currentSessionState.includedFiles?.length || 0
          });
          
          try {
            // Use saveSessionAction to save the current session state
            const saveStartTime = Date.now();
            console.log(`[SessionManager][${startTimestamp}] Step 3.4: Starting saveSessionAction at ${new Date(saveStartTime).toISOString()}`);
            
            const saveResult = await saveSessionAction({
              id: sessionIdStr,
              name: currentSessionName,
              projectDirectory,
              taskDescription: currentSessionState.taskDescription,
              searchTerm: currentSessionState.searchTerm,
              includedFiles: currentSessionState.includedFiles,
              forceExcludedFiles: currentSessionState.forceExcludedFiles,
              titleRegex: currentSessionState.titleRegex,
              contentRegex: currentSessionState.contentRegex,
              isRegexActive: currentSessionState.isRegexActive,
              diffTemperature: currentSessionState.diffTemperature
            }, signal);
            
            const saveDuration = Date.now() - saveStartTime;
            
            if (!saveResult.isSuccess) {
              console.warn(`[SessionManager][${startTimestamp}] ⚠️ Warning: Failed to save previous session state after ${saveDuration}ms: ${saveResult.message}`);
            } else {
              console.log(`[SessionManager][${startTimestamp}] Step 3.5: Successfully saved state of session ${sessionIdStr} in ${saveDuration}ms`);
            }
          } catch (saveError) {
            if (signal.aborted) {
              console.log(`[SessionManager][${startTimestamp}] Save operation for session ${sessionIdStr} was aborted`);
            } else {
              console.error(`[SessionManager][${startTimestamp}] ❌ Error saving previous session state:`, saveError);
            }
          }
          
          // Clear the previous active session ID in the context
          // This will trigger state reset in consumer components
          console.log(`[SessionManager][${startTimestamp}] Step 4: Updating context to clear previous session ID: ${sessionIdStr}`);
          updateActiveSessionInContext(null);
        } catch (error) {
          console.error(`[SessionManager][${startTimestamp}] ❌ Error clearing session context:`, error);
        }
      } else {
        console.log(`[SessionManager][${startTimestamp}] No active session to save before switching`);
      }
      
      // Get the latest session state from the database using a new AbortController
      const loadController = new AbortController();
      console.log(`[SessionManager][${startTimestamp}] Step 5: Fetching session data for: ${session.id}`);
      const fetchStartTime = Date.now();
      const result = await getSessionAction(session.id, loadController.signal);
      const fetchDuration = Date.now() - fetchStartTime;
      
      if (result.isSuccess && result.data) {
        const currentSession = result.data;
        
        // Validate that we have a valid session ID
        if (!currentSession || !currentSession.id) {
          throw new Error("Invalid session data returned from database");
        }
        
        console.log(`[SessionManager][${startTimestamp}] Step 6: Fetched session data successfully in ${fetchDuration}ms:`, {
          id: currentSession.id,
          name: currentSession.name,
          hasTaskDescription: !!currentSession.taskDescription,
          taskDescriptionLength: currentSession.taskDescription?.length || 0,
          includedFilesCount: currentSession.includedFiles?.length || 0,
          excludedFilesCount: currentSession.forceExcludedFiles?.length || 0
        });
        
        // Update the active session ID in the context so other components can react
        if (currentSession && currentSession.id) {
          console.log(`[SessionManager][${startTimestamp}] Step 7: Updating context with new active session ID: ${currentSession.id}`);
          updateActiveSessionInContext(currentSession.id);
          
          // Use startTransition for a smoother UI update when loading the new session
          startTransition(() => {
            // Load the session data into the form
            console.log(`[SessionManager][${startTimestamp}] Step 8: Applying session state to UI components via startTransition`);
            onLoadSession(currentSession);
            
            // Update the session name in the parent component
            onSessionNameChange(currentSession.name);
            
            console.log(`[SessionManager][${startTimestamp}] Step 9: Successfully loaded session: ${currentSession.id}`);
            
            // Track session loading via global function if available
            if (typeof window !== 'undefined' && window.sessionMonitor) {
              window.sessionMonitor.record(currentSession.id);
              console.log(`[SessionManager][${startTimestamp}] Session transition recorded in sessionMonitor`);
            }
          });
        } else {
          throw new Error("Session data is missing required ID");
        }
      } else {
        console.error(`[SessionManager][${startTimestamp}] ❌ Failed to load session: ${result.message}`);
        showNotification({
          title: "Error",
          message: result.message || "Failed to load session",
          type: "error"
        });
        
        // Reset the active session ID in the context
        updateActiveSessionInContext(null);
      }
    } catch (error) {
      console.error(`[SessionManager][${startTimestamp}] ❌ Error loading session: ${error}`);
      
      // Provide more informative error message for timeouts
      let errorMessage = 'Failed to load session';
      
      if (error && typeof error === 'object' && 'name' in error) {
        if (error.name === 'OperationTimeoutError') {
          errorMessage = 'Session loading timed out. This could be due to large session data or temporary system load. Please try again later.';
          
          // Immediately trigger a health check to clean up any stuck operations
          try {
            console.log(`[SessionManager][${startTimestamp}] Triggering stuck session cleanup for timed out session: ${session.id}`);
            sessionSyncService.clearStuckSession(session.id);
          } catch (cleanupError) {
            console.error(`[SessionManager][${startTimestamp}] ❌ Error during cleanup after timeout:`, cleanupError);
          }
        } else {
          errorMessage = error instanceof Error ? error.message : String(error);
        }
      } else {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      
      // Check for abort errors (don't show notifications for these as they are expected)
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[SessionManager][${startTimestamp}] Operation was aborted, suppressing error notification`);
      } else {
        // Show notification for other errors
        showNotification({
          title: "Error",
          message: errorMessage,
          type: "error"
        });
      }
      
      // Reset the active session ID in the context
      updateActiveSessionInContext(null);
    } finally {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const endTimestamp = new Date(endTime).toISOString();
      
      setIsSyncingState(false);
      setIsSwitchingSession(false);
      
      console.log(`[SessionManager][${endTimestamp}] 🔄 SESSION SWITCH COMPLETED: Changed from ${activeSessionId || 'null'} to ${session.id} in ${duration}ms`);
      console.log(`[SessionManager][${endTimestamp}] Final state: isSyncingState=false, isSwitchingSession=false`);
    }
  };

  // Handle cloning a session
  const handleClone = async (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Validate session.id
    if (!session.id || typeof session.id !== 'string') {
      console.error(`[SessionManager] Invalid session ID type: ${typeof session.id}, value:`, session.id);
      showNotification({
        title: "Error",
        message: "Invalid session ID format",
        type: "error"
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Get fresh session data
      const result = await getSessionAction(session.id);
      
      if (!result.isSuccess || !result.data) {
        throw new Error(result.message || "Failed to load session data");
      }
      
      const sourceSession = result.data;
      
      // Generate clone name
      const cloneName = `${sourceSession.name || 'Untitled'} (Copy)`;
      
      // Always generate a new UUID for the cloned session
      const newSessionId = generateUUID();
      
      // Create new session data with a new ID but same content
      const cloneData: Partial<Session> = {
        id: newSessionId,
        name: cloneName,
        projectDirectory: sourceSession.projectDirectory,
        taskDescription: sourceSession.taskDescription,
        searchTerm: sourceSession.searchTerm,
        pastedPaths: sourceSession.pastedPaths,
        titleRegex: sourceSession.titleRegex,
        contentRegex: sourceSession.contentRegex,
        isRegexActive: sourceSession.isRegexActive,
        diffTemperature: sourceSession.diffTemperature,
        includedFiles: sourceSession.includedFiles,
        forceExcludedFiles: sourceSession.forceExcludedFiles
      };
      
      // Create the cloned session
      const createResult = await createSessionAction(cloneData);
      
      if (createResult.isSuccess && createResult.data) {
        // Reload sessions to show the new clone
        await loadSessions();
        
        showNotification({
          title: "Success",
          message: `Session cloned successfully as "${cloneName}"`,
          type: "success"
        });
      } else {
        throw new Error(createResult.message || "Failed to clone session");
      }
    } catch (error) {
      console.error("[SessionManager] Error cloning session:", error);
      
      showNotification({
        title: "Error",
        message: `Failed to clone session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="grid grid-cols-4 gap-2 flex-1">
          <div className="col-span-3">
            <Input
              value={sessionNameInput}
              onChange={(e) => setSessionNameInput(e.target.value)}
              placeholder="Session name"
              disabled={isLoading || isSwitchingSession}
              className="w-full"
            />
          </div>
          <div className="flex space-x-2">
            <Button
              onClick={handleSave}
              disabled={isLoading || !sessionNameInput.trim() || isSwitchingSession}
              className="flex items-center gap-1 flex-1"
            >
              {isLoading || isSwitchingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className="border rounded-md">
        <div className="p-2 bg-muted/50 border-b flex justify-between items-center">
          <h3 className="text-sm font-medium">Sessions</h3>
          {isSwitchingSession && (
            <div className="flex items-center text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Switching...
            </div>
          )}
        </div>
        
        {isLoading && sessions.length === 0 ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No saved sessions for this project.
            {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
          </div>
        ) : (
          <div className="max-h-[200px] overflow-y-auto">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`
                  flex items-center justify-between p-2 border-b last:border-0 
                  ${activeSessionId === session.id ? "bg-accent" : "hover:bg-muted"}
                  ${isSwitchingSession ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
                `}
                onClick={() => !isSwitchingSession && handleLoadSession(session)}
              >
                {editingSessionId === session.id ? (
                  <div className="flex-1 flex items-center mr-2">
                    <Input
                      value={editSessionNameInput}
                      onChange={(e) => setEditSessionNameInput(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleUpdateSessionName(session.id);
                        } else if (e.key === "Escape") {
                          cancelEditing(e);
                        }
                      }}
                      autoFocus
                      className="h-8"
                      disabled={isSwitchingSession}
                    />
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={isSwitchingSession}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateSessionName(session.id);
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={isSwitchingSession}
                        onClick={cancelEditing}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col">
                    <span className="text-sm font-medium">
                      {session.name || "Untitled Session"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(session.updatedAt || Date.now()).toLocaleString()}
                    </span>
                  </div>
                )}

                {editingSessionId !== session.id && (
                  <div className="flex items-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={(e) => handleClone(session, e)}
                      title="Clone session"
                      disabled={isSwitchingSession}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={(e) => startEditingSession(session, e)}
                      title="Rename session"
                      disabled={isSwitchingSession}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={(e) => e.stopPropagation()}
                          title="Delete session"
                          disabled={isSwitchingSession}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Session</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the session &quot;{session.name || "Untitled Session"}&quot;.
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(session.id);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Reload sessions button */}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          onClick={() => {
            if (!pendingLoadRef.current && !isLoading && !isSwitchingSession) {
              console.log('[SessionManager] Manual refresh triggered');
              loadSessions();
            } else {
              console.log('[SessionManager] Ignoring manual refresh - operation already in progress');
            }
          }}
          disabled={isLoading || pendingLoadRef.current || isSwitchingSession}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isLoading || isSwitchingSession ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
};

// Export the component with memo to prevent unnecessary re-renders
export default memo(SessionManager);
