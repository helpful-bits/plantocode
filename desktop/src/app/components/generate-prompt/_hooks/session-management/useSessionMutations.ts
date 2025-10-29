"use client";

import { useCallback } from "react";

import { useNotification } from "@/contexts/notification-context";
import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session/index";
import { type Session } from "@/types/session-types";
import { normalizePath } from "@/utils/path-utils";
import { generateUUID } from "@/utils/string-utils";
import { duplicateSessionAction } from "@/actions/session";

interface UseSessionMutationsProps {
  projectDirectory: string | null;
  loadSessions: (forceRefresh?: boolean) => Promise<void>;
  setSessions: (sessions: Session[], forceUpdate?: boolean) => void;
  sessions: Session[];
  sessionNameInput: string;
  setSessionNameInput: (name: string) => void;
  editSessionNameInput: string;
  setEditSessionNameInput: (name: string) => void;
  setEditingSessionId: (id: string | null) => void;
  deletedSessionIdsRef: React.MutableRefObject<Set<string>>;
}

/**
 * Hook to handle session mutations (create, update, delete, clone)
 */
export function useSessionMutations({
  projectDirectory,
  loadSessions,
  setSessions,
  sessions,
  sessionNameInput,
  setSessionNameInput,
  editSessionNameInput,
  setEditSessionNameInput,
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
    createNewSession,
    deleteActiveSession,
    deleteNonActiveSession,
    renameActiveSession,
    renameSession,
    loadSessionById,
  } = useSessionActionsContext();

  const { showNotification } = useNotification();


  /**
   * Create a new session
   */
  const createSession = useCallback(async () => {
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

    // Create operation ID for tracking this specific creation
    // Generate a temporary ID for the new session
    const tempId = `temp_${generateUUID()}`;

    // Starting session creation operation

    try {
      // Normalize the project directory
      const normalizedProjectDir = await normalizePath(projectDirectory);

      // Creating new session

      // Determine initial state for new session
      const initialStateForNewSession: Partial<Session> = { 
        projectDirectory: normalizedProjectDir,
        taskDescription: "",
        searchTerm: "",
        includedFiles: [] as string[],
        forceExcludedFiles: [] as string[],
        searchSelectedFilesOnly: false,
        createdAt: Date.now(),
      };

      // Create a temporary session object for optimistic UI update
      const tempSession: Session = {
        ...initialStateForNewSession,
        id: tempId,
        name: sessionNameInput,
        projectDirectory: normalizedProjectDir, // Ensure projectDirectory is always defined
        updatedAt: Date.now(),
        createdAt: Date.now(), // Add the required createdAt field
        includedFiles: initialStateForNewSession.includedFiles ?? [],
        forceExcludedFiles: initialStateForNewSession.forceExcludedFiles ?? [],
        searchSelectedFilesOnly: initialStateForNewSession.searchSelectedFilesOnly ?? false,
      };

      // Optimistic UI update - add the new session to the list immediately
      setSessions([tempSession, ...sessions], false);

      // Create a new session using the SessionContext
      const sessionId = await createNewSession(sessionNameInput, initialStateForNewSession);

      if (sessionId) {
        // Session created successfully
        // Note: createNewSession already calls onSessionNeedsReload(sessionId) 
        // which triggers loadSessionById to activate the new session

        // Remove the temporary session from the optimistic update
        setSessions(sessions.filter(s => s.id !== tempId), false);

        // Force refresh the session list to ensure the new session appears with correct data
        await loadSessions(true);

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
      // Loading state managed by SessionContext
    }
  }, [
    sessionNameInput,
    projectDirectory,
    sessions,
    setSessions,
    createNewSession,
    loadSessions,
    setSessionNameInput,
    showNotification,
  ]);

  /**
   * Update a session name
   */
  const updateSessionName = useCallback(async (sessionId: string) => {
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

    try {
      // If this is the active session, update the session name in context
      if (sessionId === activeSessionId) {
        await renameActiveSession(editSessionNameInput);
      } else {
        // For non-active sessions, use the dedicated renameSession action
        await renameSession(sessionId, editSessionNameInput);
      }

      // Clear editing state
      setEditingSessionId(null);

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
      // Loading state managed by SessionContext
    }
  }, [
    editSessionNameInput,
    activeSessionId,
    renameActiveSession,
    renameSession,
    setEditingSessionId,
    loadSessions,
    showNotification,
  ]);

  /**
   * Delete a session
   */
  const deleteSession = useCallback(async (sessionId: string) => {
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

    // Add to recently deleted sessions set
    deletedSessionIdsRef.current.add(sessionId);

    // Starting session deletion operation

    try {
      // If this is the active session, use SessionContext's deleteActiveSession
      if (sessionId === activeSessionId) {
        await deleteActiveSession();
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
      // Loading state managed by SessionContext
    }
  }, [
    deletedSessionIdsRef,
    activeSessionId,
    deleteActiveSession,
    deleteNonActiveSession,
    loadSessions,
    showNotification,
  ]);

  /**
   * Clone a session
   */
  const cloneSession = useCallback(async (session: Session) => {
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
      // Generate clone name
      const cloneName = `${session.name || "Untitled"} (Copy)`;

      const res = await duplicateSessionAction(session.id, cloneName);
      if (res.isSuccess && res.data) {
        await loadSessions(true);

        // Auto-focus the cloned session name for editing
        setEditingSessionId(res.data.id);
        setEditSessionNameInput(res.data.name);

        showNotification({
          title: "Success",
          message: `Cloned as ${res.data.name}`,
          type: "success",
        });
      } else {
        showNotification({
          title: "Error",
          message: res.message ?? "Clone failed",
          type: "error",
        });
      }
    } catch (error) {
      // Error cloning session

      showNotification({
        title: "Error",
        message: `Failed to clone session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
    } finally {
      // Loading state managed by SessionContext
    }
  }, [loadSessions, setEditingSessionId, setEditSessionNameInput, showNotification]);

  /**
   * Load a session's details
   */
  const loadSessionDetail = useCallback(async (session: Session) => {
    // If we're already loading, skip
    if (isSessionLoading) {
      return;
    }
    
    // If the session is already loaded as the current session, skip
    if (currentSession?.id === session.id) {
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

      // Save any pending changes to the current session
      if (isSessionModified && currentSession) {
        await flushSaves();
      }

      // Load the session directly through session context
      await loadSessionById(session.id);
    } catch (error) {
      // Error loading session

      showNotification({
        title: "Error",
        message: `Failed to load session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
    } finally {
      // Loading state managed by SessionContext
    }
  }, [
    isSessionLoading,
    activeSessionId,
    isSessionModified,
    currentSession,
    flushSaves,
    loadSessionById,
    showNotification,
  ]);

  return {
    createSession,
    updateSessionName,
    deleteSession,
    cloneSession,
    loadSessionDetail,
  };
}
