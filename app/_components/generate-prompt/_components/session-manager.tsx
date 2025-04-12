"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Session } from "@/types/session-types";
import { hashString } from "@/lib/hash";
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

interface SessionManagerProps {
  projectDirectory: string;
  getCurrentSessionState: () => Omit<Session, "id" | "name">;
  onLoadSession: (session: Session) => void;
  outputFormat: string; // Pass output format to scope sessions
  activeSessionId: string | null; // Add active session ID prop
}

const SESSION_STORAGE_PREFIX = "o1-pro-flow-sessions-";

export function SessionManager({
  projectDirectory,
  getCurrentSessionState,
  onLoadSession,
  outputFormat,
  activeSessionId: externalActiveSessionId,
}: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(externalActiveSessionId);
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSessionKey = useCallback((dir: string, format: string) => {
    if (!dir) return null;
    const hash = hashString(dir);
    return `${SESSION_STORAGE_PREFIX}${hash}-${format}`;
  }, []);

  const loadSessions = useCallback(() => {
    const key = getSessionKey(projectDirectory, outputFormat);
    if (!key) {
      setSessions([]);
      return;
    }
    try {
      const storedSessions = localStorage.getItem(key);
      if (storedSessions) {
        setSessions(JSON.parse(storedSessions));
      } else {
        setSessions([]);
      }
      setError(null);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError("Failed to load sessions from storage.");
      setSessions([]);
    }
  }, [projectDirectory, outputFormat, getSessionKey]);

  useEffect(() => {
    if (projectDirectory) {
      loadSessions();
    } else {
      setSessions([]); // Clear sessions if project directory is cleared
    }
  }, [projectDirectory, outputFormat, loadSessions]);

  // Sync activeSessionId whenever external prop changes
  useEffect(() => {
    setActiveSessionId(externalActiveSessionId);
  }, [externalActiveSessionId]);

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
    const key = getSessionKey(projectDirectory, outputFormat);
    if (!key) {
      setError("Cannot save session without a project directory.");
      return;
    }

    let sessionName = sessionNameInput.trim();
    setIsLoading(true);
    setError(null);

    try {
      const currentState = getCurrentSessionState();

      // Auto-generate name if empty (this is synchronous now)
      if (!sessionName) {
        sessionName = await generateSessionTitle(currentState); // Still async in case we add AI later
      }

      const newSession: Session = {
        ...currentState,
        id: Date.now().toString(),
        name: sessionName,
      };

      const updatedSessions = [...sessions, newSession];
      localStorage.setItem(key, JSON.stringify(updatedSessions));
      setSessions(updatedSessions);
      setSessionNameInput(""); // Clear input after save
      setActiveSessionId(newSession.id); // Set as active session
    } catch (err) {
      console.error("Failed to save session:", err);
      setError("Failed to save the session.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (sessionId: string) => {
    const key = getSessionKey(projectDirectory, outputFormat);
    if (!key) return;

    try {
      const updatedSessions = sessions.filter((s) => s.id !== sessionId);
      localStorage.setItem(key, JSON.stringify(updatedSessions));
      setSessions(updatedSessions);
      setError(null);
    } catch (err) {
      console.error("Failed to delete session:", err);
      setError("Failed to delete the session.");
    }
  };

  // Load session handler
  const handleLoadSession = (session: Session) => {
    setActiveSessionId(session.id);
    onLoadSession(session);
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
          className="h-9 flex-1"
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
            return (
              <li
                key={session.id}
                className={`flex justify-between items-center p-3 rounded-md border cursor-pointer group transition-colors ${
                  isActive
                    ? 'bg-primary/20 border-primary shadow-sm'
                    : 'bg-card hover:bg-muted/50'
                }`}
                onClick={() => handleLoadSession(session)}
                title="Click to load session"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {isActive && (
                    <div className="flex items-center" title="Active Session">
                      <Sparkles className="h-4 w-4 text-primary flex-shrink-0 animate-pulse" />
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm truncate font-medium ${
                      isActive ? 'text-primary' : 'group-hover:text-primary'
                    }`}>
                      {session.name}
                    </span>
                    {isActive && (
                      <span className="text-xs text-primary/70">Active Session</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
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
