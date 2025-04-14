"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Session } from "@/types"; // Import Session from types/index
import { Save, Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { OutputFormat } from "@/types";

interface SessionManagerProps {
  projectDirectory: string;
  outputFormat: OutputFormat;
  getCurrentSessionState: () => Omit<Session, "id" | "name">;
  onLoadSession: (session: Session) => void;
  activeSessionId: string | null;
  setActiveSessionIdExternally: (id: string | null) => void;
  onSessionStatusChange?: (hasActiveSession: boolean) => void;
}

const SessionManager = ({
  projectDirectory,
  getCurrentSessionState,
  outputFormat,
  onLoadSession,
  activeSessionId: externalActiveSessionId,
  setActiveSessionIdExternally,
  onSessionStatusChange,
}: SessionManagerProps) => {
  const { repository } = useDatabase();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionIdInternal] = useState<string | null>(externalActiveSessionId); // Use internal setter
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingState, setIsSyncingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionInitialized, setSessionInitialized] = useState<boolean>(!!externalActiveSessionId);
  const sessionLoadedRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionNameInput, setEditSessionNameInput] = useState("");
  const [isRestoringSession, setIsRestoringSession] = useState(false);

  // Add a reference to track if we've loaded sessions for the current project/format
  const loadedProjectRef = useRef<string | null>(null);

  // Load sessions from the database
  const loadSessions = useCallback(async () => {
    if (!projectDirectory || !outputFormat) {
      setSessions([]);
      setError(null);
      return;
    }
    
    try {
      setIsLoading(true);
      const loadedSessions = await repository.getSessions(projectDirectory, outputFormat as OutputFormat) || [];
      console.log(`Loaded ${loadedSessions.length} sessions from database for ${projectDirectory}/${outputFormat}`);
      setSessions(loadedSessions);
      setError(null);
      
      // Check if we have at least one session available and no session is currently active
      if (loadedSessions.length > 0 && !activeSessionId) {
        // Try to restore active session
      }
      
      // Notify parent component about session status
      if (onSessionStatusChange) {
        onSessionStatusChange(!!activeSessionId || loadedSessions.length > 0);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError("Failed to load sessions from database.");
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectDirectory, outputFormat, repository, activeSessionId, onSessionStatusChange]);

  // Try to restore active session from database
  const restoreActiveSession = useCallback(async () => {
    if (!projectDirectory || !outputFormat) return;
    
    if (!sessionInitialized && !isRestoringSession) { // Only restore if not initialized and not already restoring
      setIsRestoringSession(true);
      try {
        // Get active session ID from database
        const storedSessionId = await repository.getActiveSessionId(projectDirectory, outputFormat as OutputFormat);
        
        if (storedSessionId) {
          // Try to get the session details
          const session = await repository.getSession(storedSessionId);
          
          if (session) {
            console.log(`Restored session: ${session.name} (${session.id})`);
            setActiveSessionIdInternal(session.id); // Use internal setter
            setActiveSessionIdExternally(session.id);
            onLoadSession(session);
            setSessionInitialized(true);
            sessionLoadedRef.current = true;
          } else {
            console.log(`Stored active session ID (${storedSessionId}) not found in database. Clearing active session.`);
            setActiveSessionIdInternal(null);
            setActiveSessionIdExternally(null);
            await repository.setActiveSession(projectDirectory, outputFormat, null); // Clear invalid ID in DB
          }
        }
      } catch (err) {
        console.error("Failed to restore active session:", err);
      } finally {
        setIsRestoringSession(false);
      }
    }
  }, [projectDirectory, outputFormat, repository, setActiveSessionIdExternally, onLoadSession, sessionInitialized, isRestoringSession]);

  // Save form state to localStorage as a backup
  const saveFormStateToLocalStorage = useCallback((sessionId: string, formState: any) => {
    try {
      if (!sessionId) return;
      
      const storageKey = `form-state-${sessionId}`;
      const stateWithTimestamp = {
        ...formState,
        lastSaved: Date.now()
      };
      
      localStorage.setItem(storageKey, JSON.stringify(stateWithTimestamp));
      localStorage.setItem(`last-active-session-${projectDirectory}-${outputFormat}`, sessionId);
    } catch (err) {
      console.error("Failed to save form state to localStorage:", err);
    }
  }, [projectDirectory, outputFormat]);

  // Restore form state from localStorage
  const restoreFormStateFromLocalStorage = useCallback((sessionId: string) => {
    try {
      if (!sessionId) return null;
      
      const storageKey = `form-state-${sessionId}`;
      const storedState = localStorage.getItem(storageKey);
      
      if (storedState) {
        const parsedState = JSON.parse(storedState);
        console.log(`Restored form state from localStorage for session ${sessionId}`);
        return parsedState;
      }
    } catch (err) {
      console.error("Failed to restore form state from localStorage:", err);
    }
    return null;
  }, []);

  // When component mounts or project/format changes, load sessions
  useEffect(() => {
    // Create a unique key for the current project/format combination
    const projectFormatKey = projectDirectory && outputFormat ? `${projectDirectory}-${outputFormat}` : null;
    
    // Only load sessions if we have both project and format and either:
    // 1. We haven't loaded sessions for this project/format yet, or
    // 2. The project/format has changed since last load
    if (projectDirectory && outputFormat && (!loadedProjectRef.current || loadedProjectRef.current !== projectFormatKey)) {
      console.log(`[SessionManager] Loading sessions for project/format: ${projectFormatKey}`);
      loadSessions();

        // Also attempt to restore the active session for this new context
        restoreActiveSession();

        // Update the loaded project reference
      loadedProjectRef.current = projectFormatKey;
      
      if (initialLoadDoneRef.current) {
        sessionLoadedRef.current = false;
      } else {
        initialLoadDoneRef.current = true;
      }
    } else if (!projectDirectory || !outputFormat) {
      setSessions([]);
      sessionLoadedRef.current = false;
      
      // Notify parent that we don't have an active session
      if (onSessionStatusChange) {
        onSessionStatusChange(false);
      }
      
      // Clear the loaded project reference
      loadedProjectRef.current = null;
    }

  }, [projectDirectory, outputFormat, loadSessions, restoreActiveSession, onSessionStatusChange]); // Added restoreActiveSession

  // Handle beforeunload to save pending changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Handle any teardown logic here if needed
      return null;
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [projectDirectory, outputFormat, loadSessions, activeSessionId, getCurrentSessionState, onSessionStatusChange]);

  // Sync activeSessionId whenever external prop changes
  useEffect(() => {
    setActiveSessionIdInternal(externalActiveSessionId);
    setSessionInitialized(!!externalActiveSessionId);
    
    // Notify parent about session status
    if (onSessionStatusChange) {
      onSessionStatusChange(!!externalActiveSessionId);
    }
  }, [externalActiveSessionId, onSessionStatusChange]);

  // Function to generate a meaningful title based on the session content
  const generateSessionTitle = useCallback(async (sessionData: Omit<Session, "id" | "name">) => {
    try {
      // Extract relevant information from the session
      const { taskDescription, patternDescription, includedFiles = [], forceExcludedFiles = [] } = sessionData;

      // First, prioritize the task description if available
      if (taskDescription && taskDescription.trim()) {
        // Use the first part of the task description as the title
        const firstSentence = taskDescription.split(/[.!?]\s+/)[0].trim();
        // If it's concise enough, use it directly
        if (firstSentence.length <= 60) {
          return firstSentence;
        }
        // For longer descriptions, try to create a summary
        return firstSentence.substring(0, 57) + '...';
      }

      // If no task description but we have a pattern description, use that
      if (patternDescription && patternDescription.trim()) {
        const pattern = patternDescription.trim();
        if (pattern.length <= 60) {
          return `Find: ${pattern}`;
        }
        return `Find: ${pattern.substring(0, 52)}...`;
      }

      // If we have files but no descriptions, create a file-based title
      if (includedFiles.length > 0) {
        const fileCount = includedFiles.length;
        // Get just the filenames without paths for more readable titles
        const sampleFileNames = includedFiles.slice(0, 3).map(path => {
          const parts = path.split('/');
          return parts[parts.length - 1];
        });

        if (fileCount <= 3) {
          return `Files: ${sampleFileNames.join(', ')}`;
        } else {
          return `${fileCount} files: ${sampleFileNames.join(', ')}... and ${fileCount - 3} more`;
        }
      }

      // Fallback if nothing else works
      return `Session created on ${new Date().toLocaleString()}`;
    } catch (error) {
      console.error("Error generating session title:", error);
      return `Session ${new Date().toLocaleString()}`;
    }
  }, []);

  // Create a new session
  const handleSave = async () => {
    if (!projectDirectory) {
      setError("Cannot save session without a project directory.");
      return;
    }

    if (!outputFormat) {
      setError("Cannot save session without an output format.");
      return;
    }

    let sessionName = sessionNameInput.trim();
    setIsLoading(true);
    setSessionNameInput("");
    setError(null);

    try {
      const currentState = getCurrentSessionState();
      currentState.updatedAt = Date.now(); // Ensure updatedAt is set

      // Validate current state
      if (!currentState.projectDirectory || !currentState.outputFormat) {
        console.error("Missing required session fields in current state:", {
          hasProjectDir: !!currentState.projectDirectory,
          hasOutputFormat: !!currentState.outputFormat,
        });
        throw new Error("Session state missing required fields");
      }

      // Auto-generate name if empty
      if (!sessionName) {
        sessionName = await generateSessionTitle(currentState);
      }

      const sessionId = Date.now().toString() + Math.random().toString(36).substring(2, 8); // More unique ID
      const newSession: Session = {
        ...currentState,
        id: sessionId,
        name: sessionName,
        updatedAt: Date.now(),
      };

      // Final validation before saving
      if (!newSession.id || !newSession.name || !newSession.projectDirectory || !newSession.outputFormat) {
        console.error("Missing required fields in new session:", {
          id: newSession.id,
          name: newSession.name,
          projectDirectory: newSession.projectDirectory,
          outputFormat: newSession.outputFormat
        });
        throw new Error("Cannot save session: Missing required fields");
      }

      console.log(`Saving new session: "${sessionName}" (ID: ${sessionId})`);
      
      // Save to database
      const savedSession = await repository.saveSession(newSession);
      console.log(`Successfully saved session "${sessionName}" to database`);

      
      // Reload sessions to refresh the list
      await loadSessions();
      
      // Reset pending changes
      lastSavedStateRef.current = { ...currentState };
      pendingChangesRef.current = {};
      
      // Notify parent about session status
      if (onSessionStatusChange) {
        onSessionStatusChange(true);
      }
    } catch (err) {
      console.error("Failed to save session:", err);
      setError(`Failed to save the session: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Update session name
  const handleUpdateSessionName = async (sessionId: string) => {
    if (!projectDirectory) return;
    setIsLoading(true); // Indicate loading state
    try {
      // Find the session to update
      const sessionToUpdate = sessions.find(s => s.id === sessionId);
      if (!sessionToUpdate) {
        setError("Session not found.");
        return;
      }
      
      // Update the session name
      const updatedSession = {
        ...sessionToUpdate,
        name: editSessionNameInput.trim() || sessionToUpdate.name,
        updatedAt: Date.now() // Update timestamp
      };
      
      // Save to database
      await repository.saveSession(updatedSession);
      
      // Reload sessions
      await loadSessions();
      
      setEditingSessionId(null);
      setEditSessionNameInput("");
      setError(null);
    } catch (err) {
      console.error("Failed to update session name:", err);
      setError("Failed to update the session name.");
    } finally {
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
  const cancelEditing = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setEditingSessionId(null);
    setEditSessionNameInput("");
  };

  // Delete a session
  const handleDelete = async (sessionId: string) => {
    if (!projectDirectory) return;
    setIsLoading(true); // Indicate loading state
    try {
      // Delete from database
      await repository.deleteSession(sessionId);
      
      // No localStorage removal needed
      
      // Reload sessions
      await loadSessions();
      
      // If the deleted session was active, clear the active session
      if (activeSessionId === sessionId) {
        setActiveSessionIdExternally(null);
        setSessionInitialized(false);
        // No need to call setActiveSession here, parent component will handle it
        // await repository.setActiveSession(projectDirectory, outputFormat as OutputFormat, null);
        
        // Notify parent about session status
        if (onSessionStatusChange) {
          onSessionStatusChange(false);
        }
      }
      
      setError(null);
    } catch (err) {
      console.error("Failed to delete session:", err);
      setError("Failed to delete the session.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load session handler
  const handleLoadSession = async (session: Session) => {
    if (editingSessionId === session.id) return;
      if (isSyncingState) return; // Prevent multiple loads
    try {
      setIsSyncingState(true);

    // Load the full session details again to ensure freshness
    const fullSession = await repository.getSession(session.id);
    if (!fullSession) {
        throw new Error(`Session ${session.id} not found in database.`);
    }

    onLoadSession(fullSession); // Load the fresh session data
      
      setActiveSessionIdExternally(session.id);
      setActiveSessionIdInternal(session.id); // Use internal setter
      setSessionInitialized(true);
      // Update active session in database
      await repository.setActiveSession(projectDirectory, outputFormat as OutputFormat, session.id);
      
      // Notify parent about session status
      if (onSessionStatusChange) {
        onSessionStatusChange(true);
      }
    } catch (err) {
      console.error("Failed to load session:", err);
      setError("Failed to load the session.");
    } finally {
      setIsSyncingState(false);
    }
  };


  // Create a new session dialog for initial setup
  const renderNewSessionDialog = () => {
    // Show this only if project/format is selected, DB is loaded, no session active, and no sessions exist yet
    if (projectDirectory && outputFormat && !isLoading && !activeSessionId && sessions.length === 0 && !sessionInitialized) {
      return (
        <div className="border border-dashed border-primary/50 rounded-lg p-6 flex flex-col gap-4 items-center justify-center bg-primary/5 mt-4">
          <h3 className="font-semibold text-lg text-foreground">Create Your First Session</h3>
          <p className="text-sm text-muted-foreground text-center">
            Create a session to start using the form. All your inputs will be saved automatically.
          </p>
          <div className="flex gap-2 w-full max-w-md">
            <Input
              type="text"
              placeholder="Session name (auto-generated if empty)..."
              value={sessionNameInput}
              onChange={(e) => setSessionNameInput(e.target.value)}
              className="h-9 flex-1"
            />
            <Button
              aria-label="Create new session"
              type="button"
              onClick={handleSave}
              size="sm"
              className="whitespace-nowrap px-4 h-9"
            >
              <Plus className="h-4 w-4 mr-2" /> Create Session
            </Button>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <div className="border rounded-lg p-4 flex flex-col gap-4 bg-card shadow-sm">
        <h3 className="font-semibold text-lg text-card-foreground flex items-center gap-2">
          <Save className="h-4 w-4" /> Saved Sessions ({outputFormat})
        </h3>
        {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
        <div className="flex gap-2 items-center"> {/* Align items center */}
          <Input
            type="text"
            placeholder="Session name (auto-generated if empty)..."
            value={sessionNameInput}
            onChange={(e) => setSessionNameInput(e.target.value)}
            disabled={!projectDirectory || !outputFormat || isLoading} // Also disable if no format
            className="h-9 flex-1 bg-background"
          />
          <Button
            type="button"
            onClick={handleSave}
            disabled={!projectDirectory || isLoading}
            size="sm"
            className="whitespace-nowrap px-4 flex items-center h-9"
            variant="outline" // Changed variant
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                Saving...
              </>
            ) : (
              <> {/* Keep icon and text */}
                <Save className="h-4 w-4 mr-2" /> Save Current
              </>
            )}
          </Button>
        </div>

        {/* Session List */}
        <ScrollArea className="h-48 w-full rounded-md border bg-background/50"> {/* Added background */}
          <div className="p-4 space-y-2">
            {isLoading && sessions.length === 0 ? ( // Show spinner only if loading and list is empty
              <div className="flex justify-center items-center h-32">
                <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
              </div>
            ) : sessions.length > 0 ? (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${
                    externalActiveSessionId === session.id // Compare with external prop
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => handleLoadSession(session)}
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
                      <Button type="button" variant="ghost" size="sm" onClick={(e) => cancelEditing(e)} className="h-8 px-3">Cancel</Button>
                    </div>
                  ) : (
                    <span className="text-sm font-medium flex-1 mr-2 truncate" title={session.name}>
                      {session.name || `Session ${session.id}`}
                    </span>
                  )}
                  <div className="flex gap-1 items-center">
                    {!editingSessionId && (
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => startEditingSession(session, e)} title="Rename Session">✎</Button>
                    )} {/* Edit Button */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={e => e.stopPropagation()} title="Delete Session"><Trash2 size={14} /></Button></AlertDialogTrigger> {/* Delete Button */}
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the session &quot;{session.name}&quot;. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleDelete(session.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{!projectDirectory || !outputFormat ? "Select project and format first." : "No sessions saved yet."}</p>
            )}
          </div>
        </ScrollArea>
        {isSyncingState && (
          <p className="text-xs text-muted-foreground">Syncing session state...</p>
        )} {/* Syncing indicator */}
      </div>
      
      {/* New Session Dialog */}
      {renderNewSessionDialog()}
    </>
  );
};

export default SessionManager;
