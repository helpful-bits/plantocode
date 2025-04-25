"use client";
import React, { useState, useEffect, useCallback, useRef, useTransition, memo } from "react";
import { Session } from '@/types/session-types';
import { Save, Trash2, Plus, Loader2, Pencil } from "lucide-react";
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
import { useDatabase } from "@/lib/contexts/database-context";
import { useProject } from "@/lib/contexts/project-context";
import { useInitialization } from "@/lib/contexts/initialization-context";
import { normalizePath } from "@/lib/path-utils";
import { debounce } from "@/lib/utils/debounce";
import { sessionSyncService } from '@/lib/services/session-sync-service';

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

// Helper function to generate UUID since crypto.randomUUID() is not available in all environments
function generateUUID() {
  // Use crypto.getRandomValues which is more widely supported
  if (typeof window !== 'undefined' && window.crypto) {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = window.crypto.getRandomValues(new Uint8Array(1))[0] % 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  } else {
    // Fallback for environments without crypto
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Helper function to check if two session arrays are functionally equal
// We only consider changes to ids and names as relevant for UI updates
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
  const { repository } = useDatabase();
  const { isLoading: projectLoading } = useProject();
  const { 
    activeSessionId: initActiveSessionId, 
    setActiveSessionId: setInitActiveSessionId,
    isLoading: initIsLoading,
    stage: initStage
  } = useInitialization();
  
  const [isPending, startTransition] = useTransition();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionIdInternal] = useState<string | null>(externalActiveSessionId);
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editSessionNameInput, setEditSessionNameInput] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const lastSavedStateRef = useRef<any>({});
  const [isSyncingState, setIsSyncingState] = useState(false);

  const loadedProjectRef = useRef<string | null>(null);
  const pendingChangesRef = useRef<Record<string, any>>({});
  const sessionLoadedRef = useRef<boolean>(false);
  const pendingProjectSwitchRef = useRef(false);
  const pendingLoadRef = useRef(false);
  const lastSavedSessionIdRef = useRef<string | null>(null);
  const saveLockRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const loadSessions = useCallback(async () => {
    if (!projectDirectory || !repository || pendingLoadRef.current) {
      return;
    }
    
    const normalizedProjectDir = normalizePath(projectDirectory);
    console.log(`[SessionManager] Loading sessions for: ${normalizedProjectDir}, hasLoadedOnce: ${hasLoadedOnceRef.current}`);
    
    pendingLoadRef.current = true;
    if (!hasLoadedOnceRef.current) {
      console.log('[SessionManager] First load, showing loading indicator');
      setIsLoading(true);
    }
    
    try {
      // Use the synchronization service
      await sessionSyncService.queueOperation(
        'load',
        null, // Not tied to a specific session ID
        async () => {
          const loadedSessions = await repository.getSessions(normalizedProjectDir);
          
          // Always mark as loaded to prevent stuck loading state
          hasLoadedOnceRef.current = true;
          console.log(`[SessionManager] Loaded ${loadedSessions.length} sessions, hasLoadedOnce set to true`);
          
          startTransition(() => {
            // Skip update if only timestamps changed (auto-saves)
            if (sessionsAreEqual(loadedSessions, sessions)) {
              console.log('[SessionManager] Sessions unchanged except for timestamps, skipping UI update');
              return;
            }
            
            setSessions(loadedSessions);
            setError(null);
            
            if (onSessionStatusChange) {
              onSessionStatusChange(!!activeSessionId || loadedSessions.length > 0);
            }
            
            loadedProjectRef.current = normalizedProjectDir;
          });
        },
        1 // Normal priority
      );
    } catch (err) {
      console.error("[SessionManager] Failed to load sessions:", err);
      setError("Failed to load sessions");
      setSessions([]);
      
      if (onSessionStatusChange) {
        onSessionStatusChange(false);
      }
      
      // Ensure loading is cleared on error
      hasLoadedOnceRef.current = true;
    } finally {
      console.log(`[SessionManager] Finish loading, setting isLoading to false, hasLoadedOnce: ${hasLoadedOnceRef.current}`);
      setIsLoading(false);
      pendingLoadRef.current = false;
    }
  }, [projectDirectory, repository, onSessionStatusChange, activeSessionId, sessions]);

  // Debounced load sessions function for automatic session reloads
  const debouncedLoadSessions = useCallback(
    debounce(() => {
      console.log('[SessionManager] Executing debounced load sessions');
      // Only call loadSessions if we're not already loading
      if (!pendingLoadRef.current) {
        loadSessions();
      }
    }, 1000),
    [loadSessions]
  );

  // Sync with initialization context's active session
  useEffect(() => {
    // Skip if we're in a loading state or not fully initialized
    if (initIsLoading || initStage !== 'ready' || activeSessionId === initActiveSessionId) {
      return;
    }
    
    console.log(`[SessionManager] Syncing with initialization context active session: ${initActiveSessionId}`);
    
    if (initActiveSessionId !== activeSessionId) {
      setActiveSessionIdInternal(initActiveSessionId);
      setActiveSessionIdExternally(initActiveSessionId);
      onActiveSessionIdChange(initActiveSessionId);
      
      // If there's a valid session ID, load the session
      if (initActiveSessionId) {
        console.log(`[SessionManager] Loading session from init context: ${initActiveSessionId}`);
        repository.getSession(initActiveSessionId).then(session => {
          if (session) {
            onLoadSession(session);
            onSessionNameChange(session.name);
            
            if (onSessionStatusChange) {
              onSessionStatusChange(true);
            }
          }
        }).catch(err => {
          console.error(`[SessionManager] Error loading session from init context: ${err}`);
        });
      }
    }
  }, [
    initActiveSessionId, 
    initIsLoading, 
    initStage, 
    activeSessionId, 
    setActiveSessionIdExternally,
    onActiveSessionIdChange,
    repository,
    onLoadSession,
    onSessionNameChange,
    onSessionStatusChange
  ]);

  // Auto-sync when data changes
  useEffect(() => {
    if (projectDirectory && repository) {
      // Set up auto-sync for sessions
      const interval = setInterval(() => {
        if (!pendingLoadRef.current) {
          console.log('[SessionManager] Auto-syncing sessions...');
          debouncedLoadSessions();
        }
      }, 10000); // Every 10 seconds
      
      return () => clearInterval(interval);
    }
  }, [projectDirectory, repository, debouncedLoadSessions]);

  // Load sessions when project directory changes - use direct load for initial load
  useEffect(() => {
    if (projectDirectory && repository && !pendingProjectSwitchRef.current) {
      console.log(`[SessionManager] Project directory changed to: ${projectDirectory}, loading sessions`);
      
      // Reset active session ID to ensure clean state when switching projects
      if (loadedProjectRef.current && loadedProjectRef.current !== normalizePath(projectDirectory)) {
        console.log(`[SessionManager] Detected project switch from ${loadedProjectRef.current} to ${projectDirectory}`);
        setActiveSessionIdInternal(null);
        setActiveSessionIdExternally(null);
        
        // Clear any pending changes
        pendingChangesRef.current = {};
        sessionLoadedRef.current = false;
        hasLoadedOnceRef.current = false;
      }
      
      loadSessions(); // Keep using direct load for initial project load
    }
  }, [projectDirectory, repository, loadSessions, setActiveSessionIdExternally, debouncedLoadSessions]);

  // Save session to database
  const handleSave = async () => {
    if (!projectDirectory || saveLockRef.current) {
      return;
    }
    
    saveLockRef.current = true;
    setIsLoading(true);
    
    try {
      const sessionName = sessionNameInput.trim() || `Session ${new Date().toLocaleString()}`;
      console.log(`[SessionManager] Creating new session: ${sessionName}`);
      
      // Get current state
      const sessionState = getCurrentSessionState();
      
      // Generate a UUID for the new session
      const sessionId = generateUUID();
      
      const newSession: Session = {
        ...sessionState,
        id: sessionId,
        name: sessionName,
        projectDirectory,
        updatedAt: Date.now()
      };
      
      // Use the transaction system to coordinate all save operations
      await sessionSyncService.executeTransaction([
        // Step 1: Save session to database
        {
          operation: 'save',
          sessionId: sessionId,
          callback: async () => {
            console.log(`[SessionManager] Saving session to database with projectDirectory: ${projectDirectory}`);
            await repository.saveSession(newSession);
            console.log(`[SessionManager] Session saved successfully: ${sessionId}`);
          }
        },
        // Step 2: Update sessions list
        {
          operation: 'load',
          sessionId: sessionId,
          callback: async () => {
            // Update sessions list - we want immediate feedback after an explicit save
            await loadSessions();
          }
        },
        // Step 3: Update active session IDs
        {
          operation: 'load',
          sessionId: sessionId,
          callback: async () => {
            // Set active session ID in both contexts
            setActiveSessionIdInternal(sessionId);
            setActiveSessionIdExternally(sessionId);
            
            // Update initialization context
            setInitActiveSessionId(sessionId);
          }
        },
        // Step 4: Update status and UI
        {
          operation: 'load',
          sessionId: sessionId,
          callback: async () => {
            // Notify session status change
            if (onSessionStatusChange) {
              onSessionStatusChange(true);
            }
            
            // Call the active session ID change callback
            onActiveSessionIdChange(sessionId);
            
            // Update session name for display
            onSessionNameChange(sessionName);
            
            // Clear last saved ref to force sync on next save
            lastSavedStateRef.current = {};
            lastSavedSessionIdRef.current = sessionId;
          }
        }
      ], 3); // High priority for explicit user action
      
      // Reset input field
      setSessionNameInput("");
      setError(null);
    } catch (err) {
      console.error("[SessionManager] Failed to save session:", err);
      setError(`Failed to save session: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      saveLockRef.current = false;
      setIsLoading(false);
    }
  };

  // Start editing session name
  const startEditingSession = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditSessionNameInput(session.name);
  };

  // Cancel editing session name
  const cancelEditing = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation();
    setEditingSessionId(null);
    setEditSessionNameInput("");
  };

  // Update session name
  const handleUpdateSessionName = async (sessionId: string) => {
    if (!sessionId || !editSessionNameInput.trim()) {
      cancelEditing();
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Get the current session
      const currentSession = await repository.getSession(sessionId);
      if (!currentSession) {
        setError(`Session not found: ${sessionId}`);
        cancelEditing();
        return;
      }
      
      // Update session name
      const updatedSession: Session = {
        ...currentSession,
        name: editSessionNameInput.trim(),
        updatedAt: Date.now()
      };
      
      // Save to database
      await repository.saveSession(updatedSession);
      
      // Update sessions list - use debounced version for non-critical update
      debouncedLoadSessions();
      
      // If this is the active session, update the display name
      if (activeSessionId === sessionId) {
        onSessionNameChange(updatedSession.name);
      }
      
      // Exit edit mode
      cancelEditing();
      setError(null);
    } catch (err) {
      console.error("[SessionManager] Failed to update session name:", err);
      setError(`Failed to update session name: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!projectDirectory) return;
    setIsLoading(true);
    
    try {
      // Use the synchronization service for deletion
      await sessionSyncService.queueOperation(
        'delete',
        sessionId,
        async () => {
          await repository.deleteSession(sessionId);
          
          // Refresh sessions list - need immediate feedback after delete
          await loadSessions();
          
          if (activeSessionId === sessionId) {
            // Update both active session IDs
            setActiveSessionIdExternally(null);
            setInitActiveSessionId(null);
            
            // Update database
            await repository.setActiveSession(projectDirectory, null);
            
            onSessionNameChange("");
            if (onSessionStatusChange) {
              onSessionStatusChange(false);
            }
            
            // Notify about active session ID change
            onActiveSessionIdChange(null);
          }
        },
        3 // High priority for explicit user action
      );
      
      setError(null);
    } catch (err) {
      console.error("Failed to delete session:", err);
      setError("Failed to delete the session.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadSession = async (session: Session) => {
    if (editingSessionId === session.id) return;
    
    // If we're already on this session, don't do anything
    if (activeSessionId === session.id && sessionLoadedRef.current) {
      console.log(`[SessionManager] Already on session ${session.id}, ignoring load request`);
      return;
    }
    
    console.log(`[SessionManager] Loading session: ${session.id} (${session.name})`);
    
    // Mark current session as unloaded to prevent state conflicts during transition
    sessionLoadedRef.current = false;
    
    // Set loading state immediately for UI feedback
    setIsLoading(true);
    
    try {
      // First, clear any previous active session cooldowns or locks
      if (activeSessionId) {
        // Make sure no save operations happen on the old session during transition
        sessionSyncService.setCooldown(activeSessionId, 'save', 2000);
      }
      
      // Fetch the full session first to ensure it exists
      const fullSession = await repository.getSession(session.id).catch(err => {
        console.error(`Error fetching session ${session.id}:`, err);
        return null;
      });
      
      if (!fullSession) {
        console.warn(`Session ${session.id} not found in database.`);
        setError(`Session "${session.name}" could not be loaded. It may have been deleted.`);
        
        setSessions(prev => prev.filter(s => s.id !== session.id));
        
        if (activeSessionId === session.id) {
          setActiveSessionIdExternally(null);
          setActiveSessionIdInternal(null);
          setInitActiveSessionId(null);
          
          // Notify about active session ID change
          onActiveSessionIdChange(null);
        }
        
        setIsLoading(false);
        return;
      }
      
      // Use the transaction system to coordinate all steps in the proper order
      await sessionSyncService.executeTransaction([
        // Step 1: Clear the current session state before loading new one
        {
          operation: 'load',
          sessionId: fullSession.id,
          callback: async () => {
            console.log(`[SessionManager] Preparing to load session ${fullSession.id} - clearing current state`);
            
            // Set current session IDs to null first to trigger clean state
            if (activeSessionId && activeSessionId !== fullSession.id) {
              // We're switching sessions, notify parent components to reset state
              setActiveSessionIdInternal(null);
              setActiveSessionIdExternally(null);
              onActiveSessionIdChange(null);
              
              // Give components time to clear state
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        },
        // Step 2: Load session data into the form
        {
          operation: 'load',
          sessionId: fullSession.id,
          callback: async () => {
            console.log(`[SessionManager] Got full session: ${fullSession.id}, calling onLoadSession`);
            onLoadSession(fullSession);
            onSessionNameChange(fullSession.name);
            
            // Give the form state time to update
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        },
        // Step 3: Update all related session IDs
        {
          operation: 'load',
          sessionId: fullSession.id,
          callback: async () => {
            console.log(`[SessionManager] Setting active session IDs to: ${fullSession.id}`);
            
            // Now update all related IDs in a consistent order
            setActiveSessionIdInternal(fullSession.id);
            setActiveSessionIdExternally(fullSession.id);
            
            // Notify about active session ID change
            onActiveSessionIdChange(fullSession.id);
            
            // Finally update initialization context
            setInitActiveSessionId(fullSession.id);
            
            // Mark session as fully loaded
            sessionLoadedRef.current = true;
          }
        },
        // Step 4: Persist active session ID to database
        {
          operation: 'save',
          sessionId: fullSession.id,
          callback: async () => {
            if (projectDirectory) {
              console.log(`[SessionManager] Persisting active session ${fullSession.id} for current project ${projectDirectory}`);
              await repository.setActiveSession(projectDirectory, fullSession.id);
            }
            
            console.log(`[SessionManager] Active session set to: ${fullSession.id}`);
            
            if (onSessionStatusChange) {
              console.log(`[SessionManager] Calling onSessionStatusChange with true`);
              onSessionStatusChange(true);
            }
          }
        }
      ], 3); // High priority for explicit user action
      
      // Set a cooldown for saving operations on this session to allow loading to complete fully
      sessionSyncService.setCooldown(fullSession.id, 'save', 1000);
    } catch (err) {
      console.error("Failed to load session:", err);
      setError(`Failed to load the session: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2 rounded-lg p-4 bg-card">
        <h3 className="text-lg font-semibold mb-2">Saved Plans / Sessions</h3>
        {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
        <div className="flex flex-col space-y-2">
          <div className="flex space-x-2">
            <Input
              value={sessionNameInput}
              onChange={(e) => setSessionNameInput(e.target.value)}
              placeholder="Enter session name"
              className="flex-1"
              disabled={isLoading || isSyncingState || isPending}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <Button
              onClick={handleSave}
              disabled={!sessionNameInput.trim() || isLoading || isSyncingState || isPending}
              title="Save current settings as a new session"
            >
              <Save className="h-4 w-4 mr-2" /> 
              Save New Plan / Session
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Enter a name for your current work session.</p>
          <p className="text-xs text-muted-foreground">Saves the current file selections, task description, and settings as a new plan.</p>
        </div>

        <div 
          className="h-48 w-full rounded-md border bg-background/50 overflow-auto" 
        >
          <div className="p-4 space-y-2">
            {isLoading && !hasLoadedOnceRef.current ? (
              <div className="flex justify-center items-center h-8">
                <Loader2 className="animate-spin h-4 w-4 text-muted-foreground" />
              </div>
            ) : sessions.length > 0 ? (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`flex items-center justify-between p-2 h-10 rounded-md cursor-pointer transition-colors min-w-0 ${
                    activeSessionId === session.id 
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-accent"
                  }`}
                  onClick={(e) => {
                    console.log(`[SessionManager] Session item clicked: ${session.id} (${session.name})`);
                    e.preventDefault();
                    handleLoadSession(session);
                  }}
                >
                  {editingSessionId === session.id ? (
                    <div className="flex-1 mr-2 flex items-center gap-2 w-full">
                      <Input
                        type="text"
                        value={editSessionNameInput}
                        onChange={(e) => setEditSessionNameInput(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateSessionName(session.id);
                          if (e.key === 'Escape') cancelEditing(e);
                        }}
                        autoFocus
                        className="h-8 text-sm flex-grow"
                      />
                      <Button type="button" variant="secondary" size="sm" onClick={() => handleUpdateSessionName(session.id)} className="h-8 px-3">Save</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={cancelEditing} className="h-8 px-3">Cancel</Button>
                    </div>
                  ) : (
                    <span className="text-sm font-medium flex-1 mr-2 truncate block" title={session.name}>
                      {session.name || `Session ${session.id}`}
                    </span>
                  )}
                  <div className="flex gap-1 items-center">
                    {editingSessionId !== session.id && (
                      <Button
                        onClick={(e) => startEditingSession(session, e)}
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Rename this session"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Delete this session permanently"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the session &quot;{session.name}&quot;. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleDelete(session.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">{!projectDirectory ? "Select project first" : "No sessions saved yet"}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// Export memoized component to avoid unnecessary re-renders
export default memo(SessionManager);
