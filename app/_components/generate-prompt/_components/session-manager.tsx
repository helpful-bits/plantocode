"use client";
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
import { sessionSyncService } from '@/lib/services/session-sync-service';
import { useNotification } from '@/lib/contexts/notification-context';
import {
  createSessionAction,
  deleteSessionAction,
  renameSessionAction,
  getSessionAction,
  getSessionsAction
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
  const [error, setError] = useState<string | null>(null);
  const [editSessionNameInput, setEditSessionNameInput] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const lastSavedSessionIdRef = useRef<string | null>(null);
  const lastLoadedProjectDirRef = useRef<string | null>(null);
  
  // Track pending changes and loading state
  const pendingLoadRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  
  // Sync with project context's active session
  useEffect(() => {
    if (projectActiveSessionId !== activeSessionId) {
      console.log(`[SessionManager] Syncing active session ID from project context: ${projectActiveSessionId || 'null'}`);
      setActiveSessionIdInternal(projectActiveSessionId);
      onActiveSessionIdChange(projectActiveSessionId);
    }
  }, [projectActiveSessionId, activeSessionId, onActiveSessionIdChange]);
  
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
    if (!projectDirectory || pendingLoadRef.current) {
      console.log(`[SessionManager] Skipping loadSessions: ${!projectDirectory ? 'No project directory' : 'Load already pending'}`);
      return;
    }
    
    const normalizedProjectDir = normalizePath(projectDirectory);
    console.log(`[SessionManager] Loading sessions for: ${normalizedProjectDir}`);
    
    pendingLoadRef.current = true;
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
          if (result.data && sessionsAreEqual(result.data, sessions)) {
            console.log('[SessionManager] Sessions unchanged except for timestamps, skipping UI update');
            return;
          }
          
          if (result.data) {
            setSessions(result.data);
            setError(null);
            
            if (onSessionStatusChange) {
              onSessionStatusChange(!!activeSessionId || result.data.length > 0);
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
      pendingLoadRef.current = false;
    }
  }, [projectDirectory, onSessionStatusChange, activeSessionId, sessions, showNotification]);

  // Debounced load sessions function
  const debouncedLoadSessions = useMemo(() => debounce(loadSessions, 1000), [loadSessions]);

  // Initial load on mount and when projectDirectory changes
  useEffect(() => {
    if (projectDirectory) {
      console.log(`[SessionManager] Project directory changed or component mounted: ${projectDirectory}`);
      loadSessions();
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
        projectDirectory, // Ensure project directory is explicitly set
        ...sessionState
      });
      
      if (result.isSuccess && result.data) {
        // Update session list
        await loadSessions();
        
        // Set active session
        setActiveSessionIdInternal(sessionId);
        setProjectActiveSessionId(sessionId);
        onActiveSessionIdChange(sessionId);
        setActiveSessionIdExternally(sessionId);
        
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
      // Update session name using server action
      const result = await renameSessionAction(sessionId, editSessionNameInput);
      
      if (result.isSuccess) {
        // Reload sessions list
        await loadSessions();
        
        // If this is the active session, update the name in UI
        if (sessionId === activeSessionId) {
          onSessionNameChange(editSessionNameInput);
        }
        
        // Clear editing state
        setEditingSessionId(null);
        
        showNotification({
          title: "Success",
          message: "Session renamed successfully",
          type: "success"
        });
      } else {
        throw new Error(result.message || "Failed to rename session");
      }
    } catch (error) {
      console.error("[SessionManager] Error updating session name:", error);
      
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
    setIsLoading(true);
    
    try {
      // Delete session using server action
      const result = await deleteSessionAction(sessionId);
      
      if (result.isSuccess) {
        // If this was the active session, clear it
        if (sessionId === activeSessionId) {
          setActiveSessionIdInternal(null);
          setProjectActiveSessionId(null);
          onActiveSessionIdChange(null);
          setActiveSessionIdExternally(null);
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
  const handleLoadSession = async (session: Session) => {
    if (activeSessionId === session.id) {
      // Already loaded
      return;
    }
    
    setIsLoading(true);
    
    try {
      // First, clear any potentially stuck operations for this session
      sessionSyncService.clearStuckSession(session.id);
      
      // Try the reliable force load first
      // This bypasses the queue and directly loads the session
      let sessionData = await sessionSyncService.forceLoadSession(session.id);
      
      // If direct loading fails, try the normal action as fallback
      if (!sessionData) {
        console.log("[SessionManager] Force load failed, trying normal action");
        const result = await getSessionAction(session.id);
        
        if (result.isSuccess && result.data) {
          sessionData = result.data;
        } else {
          throw new Error(result.message || "Failed to load session data");
        }
      }
      
      if (sessionData) {
        // Load session data
        onLoadSession(sessionData);
        
        // Update active session
        setActiveSessionIdInternal(session.id);
        setProjectActiveSessionId(session.id);
        onActiveSessionIdChange(session.id);
        setActiveSessionIdExternally(session.id);
        
        // Update name in UI
        onSessionNameChange(sessionData.name || "");
      } else {
        throw new Error("Failed to load session data - session not found");
      }
    } catch (error) {
      console.error("[SessionManager] Error loading session:", error);
      
      showNotification({
        title: "Error",
        message: `Failed to load session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle cloning a session
  const handleClone = async (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
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
              disabled={isLoading}
              className="w-full"
            />
          </div>
          <div className="flex space-x-2">
            <Button
              onClick={handleSave}
              disabled={isLoading || !sessionNameInput.trim()}
              className="flex items-center gap-1 flex-1"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className="border rounded-md">
        <div className="p-2 bg-muted/50 border-b">
          <h3 className="text-sm font-medium">Sessions</h3>
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
                  flex items-center justify-between p-2 border-b last:border-0 cursor-pointer 
                  ${activeSessionId === session.id ? "bg-accent" : "hover:bg-muted"}
                `}
                onClick={() => handleLoadSession(session)}
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
                    />
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
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
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={(e) => startEditingSession(session, e)}
                      title="Rename session"
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
          onClick={loadSessions}
          disabled={isLoading}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
};

export default SessionManager;
