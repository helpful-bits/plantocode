"use client";

import React, { useState, useEffect, useCallback, useRef, useTransition, memo, useMemo } from "react";
import { Session } from '@core/types/session-types';
import { Save, Trash2, Plus, Loader2, Pencil, Check, X, RefreshCw, Copy } from "lucide-react";
import { Button } from "@core/components/ui/button";
import { Input } from "@core/components/ui/input";
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
} from "@core/components/ui/alert-dialog";
import { useProject } from "@core/lib/contexts/project-context";
import { normalizePath } from "@core/lib/path-utils";
import { useNotification } from '@core/lib/contexts/notification-context';
import { useGeneratePrompt } from '../_contexts/generate-prompt-context';
import { useSessionContext } from '@core/lib/contexts/session-context';
import { 
  getSessionsAction 
} from '@core/actions/session-actions';

export interface SessionManagerProps {
  projectDirectory: string;
  getCurrentSessionState: () => Omit<Session, "id" | "name" | "updatedAt">;
  onLoadSession: (session: Session) => void;
  onSessionNameChange: (name: string) => void;
  sessionInitialized: boolean;
  onSessionStatusChange?: (hasActiveSession: boolean) => void;
  disabled?: boolean;
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
  onSessionNameChange,
  sessionInitialized: externalSessionInitialized,
  onSessionStatusChange,
  disabled = false,
}: SessionManagerProps) => {
  // Use the SessionContext with enhanced session persistence methods
  const {
    currentSession,
    setCurrentSession,
    activeSessionId,
    setActiveSessionId,
    isSessionLoading,
    isSessionModified,
    saveCurrentSession,
    flushSaves,
    loadSession, // Use consolidated loadSession method
    createNewSession,
    deleteActiveSession,
    deleteNonActiveSession,
    renameActiveSession
  } = useSessionContext();
  
  const { isSwitchingSession: globalIsSwitching, setIsSwitchingSession: setGlobalSwitchingState } = useProject();
  const { showNotification } = useNotification();
  const generatePromptContext = useGeneratePrompt();
  
  const [isPending, startTransition] = useTransition();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingState, setIsSyncingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editSessionNameInput, setEditSessionNameInput] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const lastLoadedProjectDirRef = useRef<string | null>(null);
  
  // Track pending changes and loading state
  const pendingLoadRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const lastFetchTimeRef = useRef<number>(0);
  const MIN_FETCH_INTERVAL_MS = 5000; // 5 seconds

  // Track operations to prevent race conditions
  const operationsRef = useRef<Set<string>>(new Set());
  const operationCounterRef = useRef<number>(0);
  const deletedSessionIdsRef = useRef<Set<string>>(new Set()); // Track recently deleted session IDs

  // Handle project directory changes specifically
  useEffect(() => {
    if (!projectDirectory) return;

    const normalizedDir = normalizePath(projectDirectory);
    const lastLoadedDir = lastLoadedProjectDirRef.current;

    if (lastLoadedDir && lastLoadedDir !== normalizedDir) {
      console.log(`[SessionManager] Project directory changed from "${lastLoadedDir}" to "${normalizedDir}"`);

      // Don't immediately clear sessions state as this causes UI flicker
      // Instead, keep showing the previous project's sessions with disabled UI
      // while loading the new sessions in the background

      // Mark the sessions list as needing a refresh
      hasLoadedOnceRef.current = false;
      pendingLoadRef.current = false;
    }

    // Update the reference
    lastLoadedProjectDirRef.current = normalizedDir;
  }, [projectDirectory]);

  const loadSessions = useCallback(async (forceRefresh: boolean = false) => {
    // Check if project directory exists
    if (!projectDirectory) {
      console.error(`[SessionManager] Skipping loadSessions: No project directory`);
      setError("No project directory selected");
      return;
    }

    if (!forceRefresh) {
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
    }

    const normalizedProjectDir = normalizePath(projectDirectory);
    console.log(`[SessionManager] Loading sessions for: ${normalizedProjectDir}${forceRefresh ? ' (forced refresh)' : ''}`);

    // Reset any previous errors
    setError(null);

    // Set pending flag and update last fetch time
    pendingLoadRef.current = true;
    lastFetchTimeRef.current = Date.now();

    // Throttle frequent calls by applying a small delay
    await new Promise(resolve => setTimeout(resolve, 50));

    if (!hasLoadedOnceRef.current) {
      setIsLoading(true);
    }

    try {
      // Generate a load ID for tracking
      const loadId = `load_${Date.now()}`;
      console.log(`[SessionManager] Load operation ${loadId} started${forceRefresh ? ' (forced)' : ''}`);

      // Call sessions action with normalized project path - no additional normalization needed in getSessionsAction
      console.log(`[SessionManager] Calling getSessionsAction with projectDir: ${normalizedProjectDir}`);
      const sessionsList = await getSessionsAction(normalizedProjectDir);

      if (!Array.isArray(sessionsList)) {
        throw new Error("Invalid response format: sessionsList is not an array");
      }

      console.log(`[SessionManager] Loaded ${sessionsList.length} sessions for project: ${normalizedProjectDir} (operation ${loadId})`);

      // Mark as loaded - even if the operation fails, we don't want repeated attempts
      hasLoadedOnceRef.current = true;

      // If we get an empty array but already have sessions displayed,
      // AND we're not currently switching sessions or forcing a refresh,
      // keep the existing sessions displayed but disabled
      if (sessionsList.length === 0 && sessions.length > 0 &&
          !forceRefresh && !globalIsSwitching) {
        console.log(`[SessionManager] Received empty sessions list but keeping existing UI state to avoid flicker`);
        setIsLoading(false); // Just clear loading state, keep UI stable
        return;
      }

      // Filter out any recently deleted sessions to prevent race conditions
      const filteredList = sessionsList.filter(session => {
        if (!session || !session.id) {
          console.warn(`[SessionManager] Found invalid session in results`, session);
          return false;
        }
        return !deletedSessionIdsRef.current.has(session.id);
      });

      if (filteredList.length !== sessionsList.length) {
        console.log(`[SessionManager] Filtered out ${sessionsList.length - filteredList.length} recently deleted or invalid sessions`);
      }

      // Log session details for debugging
      if (filteredList.length > 0) {
        console.log(`[SessionManager] Session details:`, filteredList.map(s => ({
          id: s.id,
          name: s.name,
          created: s.createdAt ? new Date(s.createdAt).toISOString() : 'unknown',
          updated: s.updatedAt ? new Date(s.updatedAt).toISOString() : 'unknown'
        })));
      } else {
        console.log(`[SessionManager] No sessions found after filtering`);
      }

      // Auto-activate a session if none is active but sessions exist
      // This helps ensure VoiceTranscription always has an active session
      if (!activeSessionId && filteredList.length > 0) {
        console.log(`[SessionManager] No active session but ${filteredList.length} sessions exist, auto-activating most recent`);

        // Sort by updated time to get the most recently used session
        const sortedSessions = [...filteredList].sort((a, b) =>
          (b.updatedAt || 0) - (a.updatedAt || 0)
        );

        if (sortedSessions.length > 0) {
          const sessionToActivate = sortedSessions[0];
          console.log(`[SessionManager] Auto-activating session: ${sessionToActivate.id} (${sessionToActivate.name || 'Untitled'})`);

          // Use a small timeout to avoid React state update conflicts
          setTimeout(() => {
            // Use loadSession with force option to ensure the session loads properly
            const loadPromise = loadSession(sessionToActivate.id, { force: true });

            loadPromise
              .then(() => {
                if (currentSession) {
                  console.log(`[SessionManager] Auto-activated session: ${sessionToActivate.id}`);
                  onLoadSession(currentSession);
                  onSessionNameChange(currentSession.name);
                }
              })
              .catch((error: unknown) => {
                console.error(`[SessionManager] Failed to auto-activate session:`, error);
              });
          }, 50);
        }
      }

      startTransition(() => {
        // Apply update without preserving any temporary sessions
        setSessions(prevSessions => {
          // When forceRefresh is true, always update the UI regardless of equality check
          // This is critical for operations like deletion to be reflected in the UI
          if (!forceRefresh && filteredList.length > 0 && sessionsAreEqual(filteredList, prevSessions)) {
            console.log(`[SessionManager] Sessions unchanged except for timestamps, skipping UI update (operation ${loadId})`);
            return prevSessions;
          }
          // For optimistic UI updates where we've already added temporary sessions with IDs starting with 'temp_',
          // we need to keep only those that are part of active operations (e.g., new session creation)
          const activeOperationTempIds = new Set(
            prevSessions
              .filter(s => s.id.startsWith('temp_') && !s.id.includes('voice') && !s.id.includes('correction'))
              .map(s => s.id)
          );

          // Only keep temporary sessions that are part of active operations in progress (e.g., session creation)
          const activeTempSessions = prevSessions.filter(s => activeOperationTempIds.has(s.id));

          if (activeTempSessions.length > 0) {
            console.log(`[SessionManager] Preserving ${activeTempSessions.length} active temporary sessions during refresh`);
          }

          const mergedSessions = [...filteredList, ...activeTempSessions];

          if (forceRefresh) {
            console.log(`[SessionManager] Force refreshing UI with ${mergedSessions.length} sessions (operation ${loadId})`);
          }

          setError(null);

          // Use a timeout to defer the state update to prevent React rendering error
          if (onSessionStatusChange) {
            setTimeout(() => {
              onSessionStatusChange(!!activeSessionId || mergedSessions.length > 0);
            }, 0);
          }

          return mergedSessions;
        });
      });
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
      }, 500); // 0.5 second cooldown
    }
  }, [
    projectDirectory,
    onSessionStatusChange,
    activeSessionId,
    showNotification,
    loadSession,
    currentSession,
    onLoadSession,
    onSessionNameChange,
    globalIsSwitching,
    sessions.length
  ]);

  // Direct load sessions function - no debouncing
  const loadSessionsWrapper = useCallback((forceRefresh = false) => loadSessions(forceRefresh), [loadSessions]);

  // Initial load on mount and when projectDirectory changes
  useEffect(() => {
    if (!projectDirectory) return;

    const normalizedDir = normalizePath(projectDirectory);
    const lastLoaded = lastLoadedProjectDirRef.current;

    // Only load sessions if project directory changed or sessions haven't been loaded yet
    if (lastLoaded !== normalizedDir || hasLoadedOnceRef.current === false) {
      if (lastLoaded !== normalizedDir) {
        console.log(`[SessionManager] Project directory changed from "${lastLoaded || 'none'}" to "${normalizedDir}"`);
      } else {
        console.log(`[SessionManager] Project directory unchanged but no sessions loaded: ${normalizedDir}`);
      }

      // Use a timeout to avoid immediate triggers on mount and allow batching of rapid changes
      const timer = setTimeout(() => {
        if (!pendingLoadRef.current) {
          loadSessions();
        }
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

    // Create operation ID for tracking this specific creation
    const operationId = `create_${++operationCounterRef.current}`;
    const tempId = `temp_${generateUUID()}`;

    // Add to active operations
    operationsRef.current.add(operationId);

    console.log(`[SessionManager] Starting session creation operation ${operationId}`);

    try {
      // Get the current session state from the form context
      const sessionState = getCurrentSessionState();

      // Normalize the project directory
      const normalizedProjectDir = normalizePath(projectDirectory);

      console.log("[SessionManager] Creating new session with project directory:", normalizedProjectDir);

      // Create a temporary session object for optimistic UI update
      const tempSession: Session = {
        ...sessionState,
        id: tempId,
        name: sessionNameInput,
        projectDirectory: normalizedProjectDir,
        updatedAt: Date.now(),
        // Only set createdAt if not already provided in sessionState
        createdAt: sessionState.createdAt || Date.now(),
      };

      // Optimistic UI update - add the new session to the list immediately
      setSessions(prevSessions => [...prevSessions, tempSession]);

      // Create a new session using the SessionContext
      const sessionId = await createNewSession(sessionNameInput, {
        ...sessionState,
        projectDirectory: normalizedProjectDir,
      });
      
      if (sessionId) {
        console.log(`[SessionManager] Session created with ID ${sessionId} (operation ${operationId})`);

        // Replace the temporary session with the real one
        setSessions(prevSessions => prevSessions.map(s =>
          s.id === tempId ? { ...s, id: sessionId } : s
        ));

        // Force refresh the session list to ensure the new session appears with correct data
        await loadSessions(true);

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
        throw new Error("Failed to save session");
      }
    } catch (error) {
      console.error(`[SessionManager] Error saving session (operation ${operationId}):`, error);

      // Remove the temporary session from the list if creation failed
      setSessions(prevSessions => prevSessions.filter(s => s.id !== tempId));

      // Reload sessions from the database to ensure UI is in sync
      await loadSessions(true);

      showNotification({
        title: "Error",
        message: `Failed to save session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error"
      });
    } finally {
      // Complete operation
      operationsRef.current.delete(operationId);
      console.log(`[SessionManager] Completed session creation operation ${operationId}`);

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
        
        // Update the session name in context
        await renameActiveSession(editSessionNameInput);
      } else {
        // For non-active sessions, we need to use the server action directly
        // Already handled in SessionContext's renameActiveSession
      }
      
      // Clear editing state
      setEditingSessionId(null);

      // Force refresh the session list to ensure the renamed session appears with correct data
      await loadSessions(true);

      showNotification({
        title: "Success",
        message: "Session renamed successfully",
        type: "success"
      });
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

    // Create operation ID for tracking this specific deletion
    const operationId = `delete_${++operationCounterRef.current}`;

    // Add to active operations
    operationsRef.current.add(operationId);

    // Add to recently deleted sessions set
    deletedSessionIdsRef.current.add(sessionId);

    console.log(`[SessionManager] Starting session deletion operation ${operationId} for session ${sessionId}`);

    // Optimistic UI update - remove session from the list immediately
    // This gives immediate feedback even before the deletion completes
    setSessions(prevSessions => prevSessions.filter(s => s.id !== sessionId));

    try {
      // If this is the active session, use SessionContext's deleteActiveSession
      if (sessionId === activeSessionId) {
        await deleteActiveSession();

        // Update parent components
        onSessionNameChange("");
      } else {
        // Use the new deleteNonActiveSession function for non-active sessions
        await deleteNonActiveSession(sessionId);
      }

      console.log(`[SessionManager] Session ${sessionId} deleted successfully (operation ${operationId})`);

      // Force reload sessions list to ensure UI is in sync with the database
      await loadSessions(true);

      showNotification({
        title: "Success",
        message: "Session deleted successfully",
        type: "success"
      });

      // Keep session ID in the deleted set for a short time to prevent race conditions
      setTimeout(() => {
        deletedSessionIdsRef.current.delete(sessionId);
        console.log(`[SessionManager] Removed session ${sessionId} from deletion tracking`);
      }, 10000); // Keep track for 10 seconds

    } catch (error) {
      console.error(`[SessionManager] Error deleting session ${sessionId} (operation ${operationId}):`, error);

      // Create a more user-friendly error message
      let errorMessage = "Failed to delete session";
      if (error instanceof Error) {
        if (error.message.includes("read-only mode") || error.message.includes("SQLITE_READONLY")) {
          errorMessage = "Cannot delete session: The database is in read-only mode. Please check file permissions.";
        } else {
          errorMessage = error.message;
        }
      }

      // Remove from deleted sessions set since deletion failed
      deletedSessionIdsRef.current.delete(sessionId);

      // Reload the sessions to restore the UI state since deletion failed
      await loadSessions(true);

      showNotification({
        title: "Error",
        message: errorMessage,
        type: "error"
      });
    } finally {
      // Complete operation
      operationsRef.current.delete(operationId);
      console.log(`[SessionManager] Completed session deletion operation ${operationId}`);

      setIsLoading(false);
    }
  };

  // Enhanced session loading with improved state coordination
  const handleLoadSession = async (session: Session) => {
    // If we're already loading or the session is already active, skip
    if (isSessionLoading || session.id === activeSessionId) {
      console.log(`[SessionManager] Skipping loadSession: ${isSessionLoading ? 'Already loading' : 'Session already active'}`);
      return;
    }

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

    try {
      // Create a unique operation ID for better logging
      const operationId = `load_${Date.now().toString(36)}`;
      console.log(`[SessionManager] Starting session load operation ${operationId} for session ${session.id}`);

      setIsSyncingState(true);

      // Save any pending changes to the current session
      // Use flushSaves for maximum reliability rather than just saveCurrentSession
      if (isSessionModified && currentSession) {
        console.log(`[SessionManager] Flushing pending changes to current session ${currentSession.id} before switching`);
        await flushSaves();
      }

      // Use consolidated loadSession method with force option
      console.log(`[SessionManager] Loading session ${session.id} with force option`);
      await loadSession(session.id, { force: true });

      // Update parent components
      if (currentSession) {
        console.log(`[SessionManager] Session ${session.id} loaded, updating UI components`);
        onLoadSession(currentSession);
        onSessionNameChange(currentSession.name);
      } else {
        console.warn(`[SessionManager] Session ${session.id} loaded but currentSession is null, this may indicate an issue`);
      }

      console.log(`[SessionManager] Session load operation ${operationId} completed successfully`);
    } catch (error) {
      console.error(`[SessionManager] Error loading session:`, error);

      showNotification({
        title: "Error",
        message: `Failed to load session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error"
      });
    } finally {
      setIsSyncingState(false);
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
      // Generate clone name
      const cloneName = `${session.name || 'Untitled'} (Copy)`;
      
      // Create clone data from the existing session
      const cloneData: Partial<Session> = {
        name: cloneName,
        projectDirectory: session.projectDirectory,
        taskDescription: session.taskDescription,
        searchTerm: session.searchTerm,
        titleRegex: session.titleRegex,
        contentRegex: session.contentRegex,
        isRegexActive: session.isRegexActive,
        includedFiles: session.includedFiles,
        forceExcludedFiles: session.forceExcludedFiles,
        negativeTitleRegex: session.negativeTitleRegex,
        negativeContentRegex: session.negativeContentRegex,
        searchSelectedFilesOnly: session.searchSelectedFilesOnly
      };
      
      // Create the cloned session
      const newSessionId = await createNewSession(cloneName, cloneData);
      
      if (newSessionId) {
        // Force refresh the session list to show the new clone
        await loadSessions(true);
        
        showNotification({
          title: "Success",
          message: `Session cloned successfully as "${cloneName}"`,
          type: "success"
        });
      } else {
        throw new Error("Failed to clone session");
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
              disabled={isLoading || globalIsSwitching || disabled}
              className="w-full h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={!sessionNameInput.trim() || globalIsSwitching || disabled}
              isLoading={isLoading}
              loadingText="Saving..."
              className="flex-1 h-9"
            >
              <Save className="h-4 w-4 mr-1.5" />
              Save
            </Button>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1 text-balance">Save the current task description and file selections as a new session.</p>

      <div className="border rounded-md shadow-sm">
        <div className="p-2 bg-muted/50 border-b flex justify-between items-center">
          <h3 className="text-sm font-medium">Sessions</h3>
        </div>
        
        {isLoading && sessions.length === 0 ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
            <span className="text-sm text-muted-foreground">Loading sessions...</span>
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
                  ${activeSessionId === session.id ? "bg-accent" : "hover:bg-muted/80"}
                  ${globalIsSwitching ? "opacity-80 cursor-not-allowed" : "cursor-pointer"}
                  ${isSessionLoading && activeSessionId === session.id ? "border-l-4 border-l-primary" : ""}
                  transition-all duration-200
                `}
                onClick={() => !globalIsSwitching && handleLoadSession(session)}
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
                      className="h-8 text-sm"
                      disabled={globalIsSwitching || isLoading || disabled}
                    />
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 rounded-sm"
                        isLoading={isLoading}
                        disabled={globalIsSwitching || disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateSessionName(session.id);
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 rounded-sm"
                        disabled={globalIsSwitching || isLoading || disabled}
                        onClick={cancelEditing}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center">
                      <span className="text-sm font-medium truncate max-w-[250px]">
                        {session.name || "Untitled Session"}
                      </span>
                      {isSessionLoading && activeSessionId === session.id && (
                        <div className="ml-2 flex items-center text-primary">
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(session.updatedAt || Date.now()).toLocaleString()}
                    </span>
                    {/* Removed "Loading session..." text */}
                  </div>
                )}

                {editingSessionId !== session.id && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 rounded-sm"
                      onClick={(e) => handleClone(session, e)}
                      title="Clone session"
                      isLoading={isLoading}
                      disabled={globalIsSwitching || disabled}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 rounded-sm"
                      onClick={(e) => startEditingSession(session, e)}
                      title="Rename session"
                      disabled={globalIsSwitching || isLoading || disabled}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive rounded-sm"
                          onClick={(e) => e.stopPropagation()}
                          title="Delete session"
                          disabled={globalIsSwitching || isLoading || disabled}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Session</AlertDialogTitle>
                          <AlertDialogDescription className="text-balance">
                            This will permanently delete the session &quot;{session.name || "Untitled Session"}&quot;.
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            onClick={(e) => e.stopPropagation()}
                            disabled={isLoading || disabled}
                          >
                            Cancel
                          </AlertDialogCancel>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(session.id);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            isLoading={isLoading}
                            loadingText="Deleting..."
                            disabled={disabled}
                          >
                            Delete
                          </Button>
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
      <div className="flex justify-between mt-2">
        {/* Display a subtle indicator when refreshing */}
        {isLoading && (
          <span className="text-xs text-muted-foreground flex items-center">
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Loading sessions...
          </span>
        )}

        <Button
          size="sm"
          variant="outline"
          className="text-xs h-8 px-3"
          onClick={() => {
            console.log('[SessionManager] Manual refresh triggered with force option');
            loadSessions(true);
          }}
          isLoading={isLoading || globalIsSwitching}
          loadingText="Refreshing..."
          loadingIcon={<RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          disabled={isLoading || globalIsSwitching || disabled}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>
    </div>
  );
};

// Export the component with memo to prevent unnecessary re-renders
export default memo(SessionManager);