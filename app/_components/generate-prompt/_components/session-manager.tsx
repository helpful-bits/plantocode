"use client";
import React, { useState, useEffect, useCallback, useRef, useTransition } from "react";
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

  const loadSessions = useCallback(async () => {
    if (!projectDirectory || !repository || pendingLoadRef.current) {
      return;
    }
    
    const normalizedProjectDir = normalizePath(projectDirectory);
    console.log(`[SessionManager] Loading sessions for: ${normalizedProjectDir}`);
    
    pendingLoadRef.current = true;
    setIsLoading(true);
    
    try {
      const loadedSessions = await repository.getSessions(normalizedProjectDir);
      
      startTransition(() => {
        setSessions(loadedSessions);
        setError(null);
        
        if (onSessionStatusChange) {
          onSessionStatusChange(!!activeSessionId || loadedSessions.length > 0);
        }
        
        loadedProjectRef.current = normalizedProjectDir;
      });
    } catch (err) {
      console.error("[SessionManager] Failed to load sessions:", err);
      setError("Failed to load sessions");
      setSessions([]);
      
      if (onSessionStatusChange) {
        onSessionStatusChange(false);
      }
    } finally {
      setIsLoading(false);
      pendingLoadRef.current = false;
    }
  }, [projectDirectory, repository, onSessionStatusChange, activeSessionId]);

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

  // Load sessions when project directory changes
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
      }
      
      loadSessions();
    }
  }, [projectDirectory, repository, loadSessions, setActiveSessionIdExternally]);

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
      
      console.log(`[SessionManager] Saving session to database with projectDirectory: ${projectDirectory}`);
      const savedSession = await repository.saveSession(newSession);
      
      console.log(`[SessionManager] Session saved successfully: ${savedSession.id}`);
      
      // Update sessions list
      await loadSessions();
      
      // Set active session ID in both contexts
      setActiveSessionIdInternal(savedSession.id);
      setActiveSessionIdExternally(savedSession.id);
      
      // Update initialization context
      setInitActiveSessionId(savedSession.id);
      
      // Notify session status change
      if (onSessionStatusChange) {
        onSessionStatusChange(true);
      }
      
      // Call the active session ID change callback
      onActiveSessionIdChange(savedSession.id);
      
      // Update session name for display
      onSessionNameChange(sessionName);
      
      // Reset input field
      setSessionNameInput("");
      setError(null);
      
      // Clear last saved ref to force sync on next save
      lastSavedStateRef.current = {};
      lastSavedSessionIdRef.current = savedSession.id;
    } catch (err) {
      console.error("[SessionManager] Failed to save session:", err);
      setError(`Failed to save the session: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
      saveLockRef.current = false;
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
      
      // Update sessions list
      await loadSessions();
      
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
      await repository.deleteSession(sessionId);
      
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
    
    console.log(`[SessionManager] Loading session: ${session.id} (${session.name})`);
    try {
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
        }
        
        return;
      }

      console.log(`[SessionManager] Got full session: ${fullSession.id}, calling onLoadSession and updating IDs`);
      
      onLoadSession(fullSession);
      onSessionNameChange(fullSession.name);
      
      console.log(`[SessionManager] Setting active session IDs (internal: ${fullSession.id}, external: ${fullSession.id})`);
      setActiveSessionIdInternal(fullSession.id);
      setActiveSessionIdExternally(fullSession.id);
      
      // Update initialization context
      setInitActiveSessionId(fullSession.id);
      
      try {
        if (projectDirectory) {
          console.log(`[SessionManager] Persisting active session ${fullSession.id} for current project ${projectDirectory}`);
          await repository.setActiveSession(projectDirectory, fullSession.id);
        }
      } catch (err) {
        console.error("Failed to set active session in database:", err);
      }
      
      console.log(`[SessionManager] Active session set to: ${fullSession.id}`);
      
      // Notify about active session ID change
      onActiveSessionIdChange(fullSession.id);
      
      if (onSessionStatusChange) {
        console.log(`[SessionManager] Calling onSessionStatusChange with true`);
        onSessionStatusChange(true);
      }
    } catch (err) {
      console.error("Failed to load session:", err);
      setError(`Failed to load the session: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <>
      <div className="border rounded-lg p-4 flex flex-col gap-3 bg-card shadow-sm">
        <h3 className="font-semibold text-lg text-card-foreground flex items-center gap-2">
          <Save className="h-4 w-4" /> Saved Sessions
        </h3>
        {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
        <div className="flex gap-2 items-center">
          <Input
            type="text"
            placeholder="Session name (auto-generated if empty)..."
            value={sessionNameInput}
            onChange={(e) => setSessionNameInput(e.target.value)}
            disabled={!projectDirectory || isLoading}
            className="h-9 flex-1 bg-background"
          />
          <Button
            type="button"
            onClick={handleSave}
            disabled={!projectDirectory || isLoading}
            size="sm"
            className="whitespace-nowrap px-4 h-9"
            variant="outline"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" /> Save New Session
              </>
            )}
          </Button>
        </div>

        <div 
          className="h-48 w-full rounded-md border bg-background/50 overflow-auto" 
        >
          <div className="p-4 space-y-2">
            {isLoading ? (
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
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => startEditingSession(session, e)} title="Rename Session">✎</Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={e => e.stopPropagation()} title="Delete Session"><Trash2 size={14} /></Button></AlertDialogTrigger>
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

export default SessionManager;
