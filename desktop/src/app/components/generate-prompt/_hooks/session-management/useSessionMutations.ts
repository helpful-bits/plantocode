"use client";

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
  sessions: Session[];
  sessionNameInput: string;
  setSessionNameInput: (name: string) => void;
  editSessionNameInput: string;
  setEditingSessionId: (id: string | null) => void;
  deletedSessionIdsRef: React.MutableRefObject<Set<string>>;
}

/**
 * Hook to handle session mutations (create, update, delete, clone)
 */
export function useSessionMutations({
  projectDirectory,
  getCurrentSessionState: _getCurrentSessionState, // Keep parameter but don't use it for createSession
  onSessionNameChangeUISync,
  loadSessions,
  setSessions,
  sessions,
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

    // Create operation ID for tracking this specific creation
    // Generate a temporary ID for the new session
    const tempId = `temp_${generateUUID()}`;

    // Starting session creation operation

    try {
      // Normalize the project directory
      const normalizedProjectDir = await normalizePath(projectDirectory);

      // Creating new session

      // Create fresh session data (without copying existing form state)
      const freshSessionState = {
        projectDirectory: normalizedProjectDir,
        taskDescription: "",
        titleRegex: "",
        contentRegex: "",
        negativeTitleRegex: "",
        negativeContentRegex: "",
        isRegexActive: false,
        searchTerm: "",
        includedFiles: [] as string[],
        forceExcludedFiles: [] as string[],
        searchSelectedFilesOnly: false,
        codebaseStructure: "",
        createdAt: Date.now(),
      };

      // Create a temporary session object for optimistic UI update
      const tempSession: Session = {
        ...freshSessionState,
        id: tempId,
        name: sessionNameInput,
        updatedAt: Date.now(),
      };

      // Optimistic UI update - add the new session to the list immediately
      setSessions([tempSession, ...sessions], false);

      // Create a new session using the SessionContext
      const sessionId = await createNewSession(sessionNameInput, freshSessionState);

      if (sessionId) {
        // Session created successfully
        // Note: createNewSession already calls onSessionNeedsReload(sessionId) 
        // which triggers loadSessionById to activate the new session

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
      // Loading state managed by SessionContext
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

    try {
      // If this is the active session, update the name in UI
      if (sessionId === activeSessionId) {
        onSessionNameChangeUISync(editSessionNameInput);

        // Update the session name in context
        await renameActiveSession(editSessionNameInput);
      } else {
        // For non-active sessions, use the dedicated renameSession action
        await renameSession(sessionId, editSessionNameInput);
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
      // Loading state managed by SessionContext
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
      // Loading state managed by SessionContext
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
      // Loading state managed by SessionContext
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

      // Save any pending changes to the current session
      if (isSessionModified && currentSession) {
        await flushSaves();
      }

      // Load the session directly through session context
      await loadSessionById(session.id);

      // Update UI with the session name
      onSessionNameChangeUISync(session.name);
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
  };

  return {
    createSession,
    updateSessionName,
    deleteSession,
    cloneSession,
    loadSessionDetail,
  };
}
