"use client";
import { useState, useEffect, useCallback, useRef, useTransition } from "react"; // Added useTransition
import { Session } from '@/types';
import { Save, Trash2, Plus, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { // Keep AlertDialog imports
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent, // Keep AlertDialogContent import
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger, // Use AlertDialogTrigger component
} from "@/components/ui/alert-dialog";
import { useDatabase } from "@/lib/contexts/database-context";

export interface SessionManagerProps {
  projectDirectory: string;
  getCurrentSessionState: () => Omit<Session, "id" | "name" | "updatedAt">; // Adjusted type
  onLoadSession: (session: Session) => void;
  activeSessionId: string | null;
  setActiveSessionIdExternally: (id: string | null) => void;
  onSessionNameChange: (name: string) => void; // Add callback for name changes
  sessionInitialized: boolean; // Add sessionInitialized prop
  onSessionStatusChange?: (hasActiveSession: boolean) => void;
}

const SessionManager = ({
  projectDirectory,
  getCurrentSessionState,
  onLoadSession,
  activeSessionId: externalActiveSessionId,
  setActiveSessionIdExternally,
  onSessionNameChange,
  sessionInitialized: externalSessionInitialized, // Use externalSessionInitialized prop
  onSessionStatusChange,
}: SessionManagerProps) => {
  const { repository } = useDatabase();
  const [isPending, startTransition] = useTransition(); // Transition for smoother UI updates
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionIdInternal] = useState<string | null>(externalActiveSessionId); // Use internal setter
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editSessionNameInput, setEditSessionNameInput] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null); // Keep state for editing session ID
  const lastSavedStateRef = useRef<any>({}); // Keep track of last saved state for change detection
  const [isSyncingState, setIsSyncingState] = useState(false);

  // Add a reference to track if we've loaded sessions for the current project/format
  const loadedProjectRef = useRef<string | null>(null);
  const pendingChangesRef = useRef<Record<string, any>>({});
  const sessionLoadedRef = useRef<boolean>(false);

  // Load sessions from the database
  const loadSessions = useCallback(async () => {
    if (!projectDirectory) {
      setSessions([]);
      setError(null);
      return;
    }

    const projectKey = projectDirectory;
    console.log(`[SessionManager] Loading sessions for: ${projectKey}`);
    setIsLoading(true);

    try { // Keep try/catch block
      const loadedSessions = await repository.getSessions(projectDirectory);
      startTransition(() => {
        setSessions(loadedSessions);
        setError(null);
        if (onSessionStatusChange) {
          onSessionStatusChange(!!activeSessionId || loadedSessions.length > 0);
        }
        loadedProjectRef.current = projectKey; // Mark as loaded using projectKey
      });
    }
     catch (err) {
      console.error("[SessionManager] Failed to load sessions:", err);
      setError("Failed to load sessions from database.");
      setSessions([]); // Ensure sessions are cleared on error
    } finally { // Ensure loading state is reset
      setIsLoading(false);
    }
  }, [projectDirectory, repository, onSessionStatusChange]); // Removed activeSessionId dependency

  // When component mounts or project changes, load sessions
  useEffect(() => {
    const projectKey = projectDirectory; // Use projectDirectory as the key

    if (projectKey && projectKey !== loadedProjectRef.current) {
      console.log(`[SessionManager] Project changed to ${projectKey}. Reloading sessions.`);
      loadSessions(); // Load sessions for the new project/format
    } else if (!projectDirectory) {
      setSessions([]);
      sessionLoadedRef.current = false;
      // Notify parent that we don't have an active session
      if (onSessionStatusChange) {
        onSessionStatusChange(false);
      }
      
      // Clear the loaded project reference
      loadedProjectRef.current = null;
    }
  }, [projectDirectory, loadSessions]);

  // Sync activeSessionId whenever external prop changes
  useEffect(() => {
    setActiveSessionIdInternal(externalActiveSessionId);
    
    // Notify parent about session status - important for UI updates
    if (onSessionStatusChange) {
      onSessionStatusChange(!!externalActiveSessionId);
    }
  }, [externalActiveSessionId, onSessionStatusChange]); // Keep dependencies

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
  const handleSave = async () => { // This function creates a *new* session, not updates the active one
    if (!projectDirectory) {
      setError("Cannot save session without a project directory.");
      return;
    }

    let sessionName = sessionNameInput.trim();
    setIsLoading(true);
    setSessionNameInput("");
    setError(null);

    try {
      const currentState = getCurrentSessionState(); // Get current form state
      // currentState.updatedAt = Date.now(); // updatedAt is set below

      // Validate current state - removed outputFormat check
      if (!currentState.projectDirectory) { // Keep validation
        console.error("Missing required session fields in current state:", {
          hasProjectDir: !!currentState.projectDirectory,
        });
        throw new Error("Session state missing required fields");
      }

      // Auto-generate name if empty
      if (!sessionName) {
        sessionName = await generateSessionTitle(currentState); // Use generateSessionTitle
      }

      const sessionId = Date.now().toString() + Math.random().toString(36).substring(2, 8); // More unique ID for new session
      const newSession: Session = {
        ...currentState,
        id: sessionId,
        name: sessionName, // Use generated or provided name
        updatedAt: Date.now(), // Set update timestamp
        geminiStatus: 'idle', // Ensure new sessions start idle
        geminiStartTime: null,
        geminiEndTime: null, // Keep geminiEndTime
        geminiPatchPath: null, // Initialize path to null
        geminiStatusMessage: null, // Initialize message to null
      };
      if (!newSession.id || !newSession.name || !newSession.projectDirectory) {
        console.error("Missing required fields in new session:", { // Log missing fields
          id: newSession.id,
          name: newSession.name,
        });
        throw new Error("Cannot save session: Missing required fields");
      }

      // Save to database repository
      const savedSession = await repository.saveSession(newSession);
      console.log(`Successfully saved session "${sessionName}" to database`);

      
      // Reload sessions to refresh the list
      await loadSessions(); // Refresh the list
      // Set the newly created session as active
      setActiveSessionIdInternal(sessionId); // Set internal state
      onSessionNameChange(sessionName); // Update parent's session name
      setActiveSessionIdExternally(sessionId);
      
      lastSavedStateRef.current = { ...currentState };
      pendingChangesRef.current = {};

      // Notify parent about session status
      if (onSessionStatusChange) {
        onSessionStatusChange(true);
      } // Update parent status
      }
     catch (err) { // Catch block
      console.error("Failed to save session:", err);
      setError(`Failed to save the session: ${err instanceof Error ? err.message : String(err)}`);
    } finally { // Ensure isLoading is reset
      setIsLoading(false);
    }
  };

  // Handle renaming a session
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
      
      // Update parent's session name if it's the active session
      if (activeSessionId === sessionId) onSessionNameChange(updatedSession.name);
      
      // Reload sessions
      await loadSessions();
      
      setEditingSessionId(null);
      setEditSessionNameInput("");
      setError(null); // Clear error on success
    } catch (err) {
      console.error("Failed to update session name:", err);
      setError("Failed to update the session name.");
    } finally {
      setIsLoading(false); // Reset loading state
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
    setIsLoading(true);
    try { // Use try/catch for error handling
      // Delete from database
      await repository.deleteSession(sessionId);
      
      // No localStorage removal needed
      
      // Reload sessions
      await loadSessions();
      
      // If the deleted session was active, clear the active session
      if (activeSessionId === sessionId) {
        setActiveSessionIdExternally(null);
        await repository.setActiveSession(projectDirectory, null);
        
        onSessionNameChange(""); // Clear name if active session deleted
        // Notify parent about session status
        if (onSessionStatusChange) {
          onSessionStatusChange(false);
        }
      }
      
      setError(null); // Clear error on success
    } catch (err) {
      console.error("Failed to delete session:", err);
      setError("Failed to delete the session.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load session handler
  const handleLoadSession = async (session: Session) => {
    if (editingSessionId === session.id) return; // Prevent load while editing
    
    console.log(`[SessionManager] Loading session: ${session.id} (${session.name})`);
    try {
      // Load the full session details again to ensure freshness
      const fullSession = await repository.getSession(session.id).catch(err => {
        console.error(`Error fetching session ${session.id}:`, err);
        return null;
      });
      
      if (!fullSession) {
        console.warn(`Session ${session.id} not found in database.`);
        setError(`Session "${session.name}" could not be loaded. It may have been deleted.`);
        
        // Remove the session from the local list if it's no longer in the database
        setSessions(prev => prev.filter(s => s.id !== session.id));
        
        // If this was the active session, clear it
        if (activeSessionId === session.id) {
          setActiveSessionIdExternally(null);
          setActiveSessionIdInternal(null);
        } // Close activeSessionId check
        
        return;
      } // Close !fullSession check

      console.log(`[SessionManager] Got full session: ${fullSession.id}, calling onLoadSession and updating IDs`);
      
      // Call parent's load handler first
      onLoadSession(fullSession); // Load the fresh session data
      onSessionNameChange(fullSession.name); // Update parent's session name
      
      // Then update active session state
      console.log(`[SessionManager] Setting active session IDs (internal: ${fullSession.id}, external: ${fullSession.id})`);
      setActiveSessionIdInternal(fullSession.id); // Use internal setter
      setActiveSessionIdExternally(fullSession.id); // Update external state too
      
      // Update active session in database
      // This is important for restoring the session later
      try {
        await repository.setActiveSession(projectDirectory, fullSession.id);
      } catch (err) {
        console.error("Failed to set active session in database:", err);
        // Continue anyway as we've already loaded the session in memory
      }
      
      console.log(`[SessionManager] Active session set to: ${fullSession.id}`);
      
      // Notify parent about session status
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
        <div className="flex gap-2 items-center"> {/* Align items center */}
          <Input
            type="text"
            placeholder="Session name (auto-generated if empty)..."
            value={sessionNameInput}
            onChange={(e) => setSessionNameInput(e.target.value)}
            disabled={!projectDirectory || isLoading}
            className="h-9 flex-1 bg-background"
          /> {/* Session Name Input */}
          <Button
            type="button"
            onClick={handleSave}
            disabled={!projectDirectory || isLoading}
            size="sm"
            className="whitespace-nowrap px-4 h-9" // Removed explicit flex items-center
            variant="outline" // Changed variant
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                Saving...
              </>
            ) : (
              <> {/* Keep icon and text */}
                <Save className="h-4 w-4 mr-2" /> Save New Session
              </>
            )}
          </Button>
        </div>

        {/* Session List */}
        <div 
          className="h-48 w-full rounded-md border bg-background/50 overflow-auto" 
        >
          <div className="p-4 space-y-2">
            {isLoading ? ( // Show spinner if loading
              <div className="flex justify-center items-center h-8">
                <Loader2 className="animate-spin h-4 w-4 text-muted-foreground" />
              </div>
            ) : sessions.length > 0 ? (
              sessions.map((session) => (
                <div // Session Item Div
                  key={session.id}
                  className={`flex items-center justify-between p-2 h-10 rounded-md cursor-pointer transition-colors min-w-0 ${
                    externalActiveSessionId === session.id 
                      ? "bg-primary/10 border border-primary/30" // Highlight active session
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
                    {editingSessionId !== session.id && ( // Show edit only if not currently editing this session
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => startEditingSession(session, e)} title="Rename Session">✎</Button> // Added tooltip
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
              <p className="text-sm text-muted-foreground text-center py-2">{!projectDirectory ? "Select project first" : "No sessions saved yet"}</p>
            )}
          </div>
        </div>
      </div>
      
      {/* New Session Dialog */}
    </>
  );
};

export default SessionManager;
