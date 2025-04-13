"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Session } from "@/types/session-types";
import { Trash2, Save, Upload, Sparkles } from "lucide-react";
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

interface SessionManagerProps {
  projectDirectory: string;
  getCurrentSessionState: () => Omit<Session, "id" | "name">;
  onLoadSession: (session: Session) => void;
  outputFormat: string; // Pass output format to scope sessions
  activeSessionId: string | null; // Add active session ID prop
  setActiveSessionIdExternally: (id: string | null) => void; // Allow parent to set active session ID
}

export function SessionManager({
  projectDirectory,
  getCurrentSessionState,
  onLoadSession,
  outputFormat,
  activeSessionId: externalActiveSessionId,
  setActiveSessionIdExternally,
}: SessionManagerProps) {
  const { repository } = useDatabase();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(externalActiveSessionId);
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionLoadedRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionNameInput, setEditSessionNameInput] = useState("");

  const loadSessions = useCallback(async () => {
    if (!projectDirectory || !outputFormat) {
      setSessions([]);
      setError(null); // Clear error if no project/format
      return;
    }
    
    try {
      // Load sessions from the database
      const loadedSessions = await repository.getSessions(projectDirectory, outputFormat as any) || [];
      console.log(`Loaded ${loadedSessions.length} sessions from database for ${projectDirectory}`);
      setSessions(loadedSessions);
      setError(null);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError("Failed to load sessions from database.");
      setSessions([]);
    }
  }, [projectDirectory, outputFormat, repository]);

  // When component mounts or project/format changes, load sessions
  useEffect(() => {
    if (projectDirectory && outputFormat) {
      loadSessions();
      // Only reset the session loaded flag when project changes, not on first mount
      if (initialLoadDoneRef.current) {
        sessionLoadedRef.current = false;
      } else {
        initialLoadDoneRef.current = true;
      }
    } else {
      setSessions([]); // Clear sessions if project directory is cleared
      sessionLoadedRef.current = false;
    }
    
    // Cleanup function to reset on unmount
    return () => {
      // Don't reset sessionLoadedRef on unmount to preserve state during page refresh
    };
  }, [projectDirectory, outputFormat, loadSessions]);

  // Sync activeSessionId whenever external prop changes
  useEffect(() => {
    setActiveSessionId(externalActiveSessionId);
  }, [externalActiveSessionId]);

  // Load the active session when sessions are loaded and active ID is set
  useEffect(() => {
    if (activeSessionId && sessions.length > 0 && !sessionLoadedRef.current) {
      const activeSession = sessions.find(session => session.id === activeSessionId);
      if (activeSession) {
        // Check if this is coming from a restoration (like page refresh)
        // or from a user clicking on a session
        if (!sessionLoadedRef.current) {
          console.log("Restoring session after refresh:", activeSession.name, activeSession);
          // Automatically load the active session
          onLoadSession(activeSession);
          sessionLoadedRef.current = true;
        }
      } else {
        console.warn("Active session ID exists but session not found in loaded sessions", {
          activeSessionId
        });
         // If the active session ID is invalid, clear it
         setActiveSessionIdExternally(null);      }
    }
  }, [sessions, activeSessionId, onLoadSession]);

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

  const handleSave = async () => {
    if (!projectDirectory) {
      setError("Cannot save session without a project directory.");
      return;
    }

    let sessionName = sessionNameInput.trim();
    setIsLoading(true);
    setSessionNameInput(""); // Clear input immediately
    setError(null);

    try {
      const currentState = getCurrentSessionState();

      // Auto-generate name if empty
      if (!sessionName) {
        sessionName = await generateSessionTitle(currentState);
      }

      const newSession: Session = {
        ...currentState,
        id: Date.now().toString(),
        name: sessionName,
      };

      // Save to database
      await repository.saveSession(newSession);
      console.log(`Saved session "${sessionName}" to database`);
      
      // Reload sessions to refresh the list
      await loadSessions();

      // Set as active session and notify parent
      setActiveSessionIdExternally(newSession.id);
      
      // Set as active session and notify parent
      setActiveSessionId(newSession.id);
      onLoadSession(newSession);

    } catch (err) {
      console.error("Failed to save session:", err);
      setError("Failed to save the session.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSessionName = async (sessionId: string) => {
    if (!projectDirectory) return;

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
        name: editSessionNameInput.trim() || sessionToUpdate.name
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
    }
  };

  const startEditingSession = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditSessionNameInput(session.name);
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(null);
    setEditSessionNameInput("");
  };

  const handleDelete = async (sessionId: string) => {
    if (!projectDirectory) return;

    try {
      // Delete from database
      await repository.deleteSession(sessionId);
      
      // Reload sessions
      await loadSessions();
      
      // If the deleted session was active, clear the active session
      if (activeSessionId === sessionId) {
        setActiveSessionIdExternally(null);
        await repository.setActiveSession(projectDirectory, outputFormat as any, null);
      }
      
      setError(null);
    } catch (err) {
      console.error("Failed to delete session:", err);
      setError("Failed to delete the session.");
    }
  };

  // Load session handler
  const handleLoadSession = async (session: Session) => {
    if (editingSessionId === session.id) return;
    
    onLoadSession(session);
    setActiveSessionIdExternally(session.id); // Update parent's active ID

    // Update active session in database
    await repository.setActiveSession(projectDirectory, outputFormat as any, session.id);
  };

  return (
    <div className="border rounded-lg p-4 flex flex-col gap-4 bg-card shadow-sm">
      <h3 className="font-semibold text-lg text-card-foreground flex items-center gap-2">
        <Save className="h-4 w-4" /> Saved Sessions ({outputFormat})
      </h3>
      {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Session name (auto-generated if empty)..."
          value={sessionNameInput}
          onChange={(e) => setSessionNameInput(e.target.value)}
          disabled={!projectDirectory || isLoading}
          className="h-9 flex-1 bg-background"
        />
        <Button
          onClick={handleSave}
          disabled={!projectDirectory || isLoading}
          size="sm"
          className="whitespace-nowrap px-4 flex items-center h-9"
          variant="secondary"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" /> Save Current
            </>
          )}
        </Button>
      </div>
      {sessions.length > 0 ? (
        <ul className="space-y-2 max-h-40 overflow-y-auto bg-background/50 rounded-md p-2">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const isEditing = session.id === editingSessionId;
            
            return (
              <li
                key={session.id}
                className={`flex justify-between items-center p-3 rounded-md border cursor-pointer group transition-colors ${
                  isActive
                    ? 'bg-primary/20 border-primary shadow-sm'
                    : 'bg-card hover:bg-muted/50'
                }`}
                onClick={() => handleLoadSession(session)}
                title={isEditing ? "" : "Click to load session"}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {isActive && !isEditing && (
                    <div className="flex items-center" title="Active Session">
                      <Sparkles className="h-4 w-4 text-primary flex-shrink-0 animate-pulse" />
                    </div>
                  )}
                  <div className="flex flex-col min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                        <Input
                          type="text"
                          value={editSessionNameInput}
                          onChange={(e) => setEditSessionNameInput(e.target.value)}
                          className="h-7 py-1 text-sm"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <Button 
                            size="icon" 
                            variant="outline" 
                            className="h-7 w-7" 
                            onClick={(e) => handleUpdateSessionName(session.id)}
                          >
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3 w-3">
                              <path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                            </svg>
                          </Button>
                          <Button 
                            size="icon" 
                            variant="outline" 
                            className="h-7 w-7" 
                            onClick={cancelEditing}
                          >
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3 w-3">
                              <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                            </svg>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className={`text-sm truncate font-medium ${
                          isActive ? 'text-primary' : 'group-hover:text-primary'
                        }`}>
                          {session.name}
                        </span>
                        {isActive && (
                          <span className="text-xs text-primary/70">Active Session</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {!isEditing && (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={(e) => startEditingSession(session, e)}
                    >
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                        <path d="M11.8536 1.14645C11.6583 0.951184 11.3417 0.951184 11.1465 1.14645L3.71455 8.57836C3.62459 8.66832 3.55263 8.77461 3.50251 8.89155L2.04044 12.303C1.9599 12.491 2.00189 12.709 2.14646 12.8536C2.29103 12.9981 2.50905 13.0401 2.69697 12.9596L6.10847 11.4975C6.2254 11.4474 6.3317 11.3754 6.42166 11.2855L13.8536 3.85355C14.0488 3.65829 14.0488 3.34171 13.8536 3.14645L11.8536 1.14645ZM4.42166 9.28547L11.5 2.20711L12.7929 3.5L5.71455 10.5784L4.21924 11.2192L3.78081 10.7808L4.42166 9.28547Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                      </svg>
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Session</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this session? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              handleDelete(session.id);
                            }}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-md">
          No saved sessions. Save your current search to access it later.
        </div>
      )}
    </div>
  );
}
