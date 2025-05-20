"use client";

import { useState } from "react";

import { useNotification } from "@/contexts/notification-context";
import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session/index";
import { type Session } from "@/types/session-types";
import { normalizePath } from "@/utils/path-utils";
import { generateUUID } from "@/utils/string-utils";

interface UseSessionMutationsProps {
  projectDirectory: string | null;
  getCurrentSessionState: () => Omit<Session, "id" | "name" | "updatedAt">;
  onSessionNameChangeUISync: (name: string) => void;
  loadSessions: (forceRefresh?: boolean) => Promise<void>;
  setSessions: (sessions: Session[], forceUpdate?: boolean) => void;
  sessionNameInput: string;
  setSessionNameInput: (name: string) => void;
  editSessionNameInput: string;
  editingSessionId: string | null;
  setEditingSessionId: (id: string | null) => void;
  deletedSessionIdsRef: React.MutableRefObject<Set<string>>;
}

/**
 * Hook to handle session mutations (create, update, delete, clone)
 */
export function useSessionMutations({
  projectDirectory,
  getCurrentSessionState,
  onSessionNameChangeUISync,
  loadSessions,
  setSessions,
  sessionNameInput,
  setSessionNameInput,
  editSessionNameInput,
  setEditingSessionId,
  deletedSessionIdsRef,
}: UseSessionMutationsProps) {
  const {
    activeSessionId,
    currentSession,
    isSessionLoading,
    isSessionModified,
  } = useSessionStateContext();

  const {
    flushSaves,
    loadSessionById,
    createNewSession,
    deleteActiveSession,
    deleteNonActiveSession,
    renameActiveSession,
  } = useSessionActionsContext();

  const { showNotification } = useNotification();

  // Loading state for mutation operations
  const [isMutating, setIsMutating] = useState(false);


  /**
   * Create a new session
   */
  const createSession = async () => {
    if (!sessionNameInput.trim()) {
      showNotification({
        title: "Error",
        message: "Please enter a session name",
        type: "error",
      });
      return;
    }

    if (!projectDirectory) {
      showNotification({
        title: "Error",
        message: "No project directory selected",
        type: "error",
      });
      return;
    }

    setIsMutating(true);

    // Create operation ID for tracking this specific creation
    // Generate a temporary ID for the new session
    const tempId = `temp_${generateUUID()}`;

    // Starting session creation operation

    try {
      // Get the current session state from the form context
      const sessionState = getCurrentSessionState();

      // Normalize the project directory
      const normalizedProjectDir = await normalizePath(projectDirectory);

      // Creating new session

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
      setSessions([tempSession], false);

      // Create a new session using the SessionContext
      const sessionId = await createNewSession(sessionNameInput, {
        ...sessionState,
        projectDirectory: normalizedProjectDir,
      });

      if (sessionId) {
        // Session created successfully

        // Force refresh the session list to ensure the new session appears with correct data
        await loadSessions(true);

        // Update name in UI
        onSessionNameChangeUISync(sessionNameInput);

        // Clear input
        setSessionNameInput("");

        showNotification({
          title: "Success",
          message: "Session saved successfully",
          type: "success",
        });
      } else {
        throw new Error("Failed to save session");
      }
    } catch (error) {
      // Error saving session

      // Reload sessions from the database to ensure UI is in sync
      await loadSessions(true);

      showNotification({
        title: "Error",
        message: `Failed to save session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  };

  /**
   * Update a session name
   */
  const updateSessionName = async (sessionId: string) => {
    // Validate sessionId
    if (!sessionId || typeof sessionId !== "string") {
      // Invalid sessionId
      showNotification({
        title: "Error",
        message: "Invalid session ID format",
        type: "error",
      });
      return;
    }

    if (!editSessionNameInput.trim()) {
      showNotification({
        title: "Error",
        message: "Session name cannot be empty",
        type: "error",
      });
      return;
    }

    setIsMutating(true);

    try {
      // If this is the active session, update the name in UI
      if (sessionId === activeSessionId) {
        onSessionNameChangeUISync(editSessionNameInput);

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
        type: "success",
      });
    } catch (error) {
      // Error updating session name

      // Reload sessions to ensure UI is in sync with server
      await loadSessions();

      showNotification({
        title: "Error",
        message: `Failed to rename session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  };

  /**
   * Delete a session
   */
  const deleteSession = async (sessionId: string) => {
    // Validate sessionId
    if (!sessionId || typeof sessionId !== "string") {
      // Invalid sessionId
      showNotification({
        title: "Error",
        message: "Invalid session ID format",
        type: "error",
      });
      return;
    }

    setIsMutating(true);


    // Add to recently deleted sessions set
    deletedSessionIdsRef.current.add(sessionId);

    // Starting session deletion operation

    try {
      // If this is the active session, use SessionContext's deleteActiveSession
      if (sessionId === activeSessionId) {
        await deleteActiveSession();

        // Update parent components
        onSessionNameChangeUISync("");
      } else {
        // Use the deleteNonActiveSession function for non-active sessions
        await deleteNonActiveSession(sessionId);
      }

      // Session deleted successfully

      // Force reload sessions list to ensure UI is in sync with the database
      await loadSessions(true);

      showNotification({
        title: "Success",
        message: "Session deleted successfully",
        type: "success",
      });

      // Keep session ID in the deleted set for a short time to prevent race conditions
      setTimeout(() => {
        deletedSessionIdsRef.current.delete(sessionId);
        // Removed session from deletion tracking
      }, 10000); // Keep track for 10 seconds
    } catch (error) {
      // Error deleting session

      // Create a more user-friendly error message
      let errorMessage = "Failed to delete session";
      if (error instanceof Error) {
        if (
          error.message.includes("read-only mode") ||
          error.message.includes("SQLITE_READONLY")
        ) {
          errorMessage =
            "Cannot delete session: The database is in read-only mode. Please check file permissions.";
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
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  };

  /**
   * Clone a session
   */
  const cloneSession = async (session: Session) => {
    // Validate session.id
    if (!session.id || typeof session.id !== "string") {
      // Invalid session ID
      showNotification({
        title: "Error",
        message: "Invalid session ID format",
        type: "error",
      });
      return;
    }

    setIsMutating(true);

    try {
      // Generate clone name
      const cloneName = `${session.name || "Untitled"} (Copy)`;

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
        searchSelectedFilesOnly: session.searchSelectedFilesOnly,
      };

      // Create the cloned session
      const newSessionId = await createNewSession(cloneName, cloneData);

      if (newSessionId) {
        // Force refresh the session list to show the new clone
        await loadSessions(true);

        showNotification({
          title: "Success",
          message: `Session cloned successfully as "${cloneName}"`,
          type: "success",
        });
      } else {
        throw new Error("Failed to clone session");
      }
    } catch (error) {
      // Error cloning session

      showNotification({
        title: "Error",
        message: `Failed to clone session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  };

  /**
   * Load a session's details
   */
  const loadSessionDetail = async (session: Session) => {
    // If we're already loading or the session is already active, skip
    if (isSessionLoading || session.id === activeSessionId) {
      // Skip loading session - already loading or session already active
      return;
    }

    // Validate session.id
    if (!session.id || typeof session.id !== "string") {
      // Invalid session ID

      showNotification({
        title: "Error",
        message: "Invalid session ID format",
        type: "error",
      });
      return;
    }

    try {
      // Starting session load operation

      setIsMutating(true);

      // Save any pending changes to the current session
      // Use flushSaves for maximum reliability rather than just saveCurrentSession
      if (isSessionModified && currentSession) {
        // Flushing pending changes to current session before switching
        await flushSaves();
      }

      // Use consolidated loadSessionById method
      await loadSessionById(session.id);

      // Update parent components
      if (currentSession) {
        // Session loaded, updating UI components
        onSessionNameChangeUISync(currentSession.name);
      } 
      // If currentSession is null after loading, it may indicate an issue

      // Session load operation completed successfully
    } catch (error) {
      // Error loading session

      showNotification({
        title: "Error",
        message: `Failed to load session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  };

  return {
    createSession,
    updateSessionName,
    deleteSession,
    cloneSession,
    loadSessionDetail,
    isMutating,
  };
}
