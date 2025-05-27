import { useState, useCallback } from "react";

import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session";
import { type Session } from "@/types/session-types";

export interface SessionFormUIState {
  // UI-specific state
  isSessionSelectorOpen: boolean;
  searchTermForSessionList: string;

  // UI handlers
  setIsSessionSelectorOpen: (isOpen: boolean) => void;
  setSearchTermForSessionList: (term: string) => void;
  toggleSessionSelector: () => void;

  // Session UI operations
  handleSessionSelect: (sessionId: string) => Promise<void>;
  handleSessionCreate: (sessionName: string) => Promise<void>;
  handleSessionDelete: (sessionId: string) => Promise<void>;
  handleSessionRename: (sessionId: string, newName: string) => Promise<void>;

  // Session filter helpers
  filterSessions: (sessions: Session[]) => Session[];
}

export interface UseSessionFormUIManagerProps {
  onSessionTransition?: () => void;
}

export function useSessionFormUIManager({
  onSessionTransition,
}: UseSessionFormUIManagerProps = {}): SessionFormUIState {
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();

  // UI-specific state for the session selector
  const [isSessionSelectorOpen, setIsSessionSelectorOpen] = useState(false);
  const [searchTermForSessionList, setSearchTermForSessionList] = useState("");

  // Toggle the session selector open/closed
  const toggleSessionSelector = useCallback(() => {
    setIsSessionSelectorOpen((prev: boolean) => !prev);
  }, []);

  // Handle session selection from the UI dropdown
  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      try {
        if (sessionId === sessionState.currentSession?.id) {
          // Already selected, just close the selector
          setIsSessionSelectorOpen(false);
          return Promise.resolve();
        }

        // Transition to the selected session
        sessionActions.setActiveSessionId(sessionId);

        // Reset UI state
        setIsSessionSelectorOpen(false);
        setSearchTermForSessionList("");

        // Call optional callback for session transition
        if (onSessionTransition) {
          onSessionTransition();
        }
        
        return Promise.resolve();
      } catch (error) {
        console.error(
          "[useSessionFormUIManager] Error selecting session:",
          error
        );
        return Promise.reject(error);
      }
    },
    [sessionState.currentSession?.id, sessionActions, onSessionTransition]
  );

  // Handle session creation from UI form
  const handleSessionCreate = useCallback(
    async (sessionName: string) => {
      try {
        await sessionActions.createNewSession(sessionName, {
          projectDirectory: sessionState.currentSession?.projectDirectory || "",
        });

        // Reset UI state
        setIsSessionSelectorOpen(false);
        setSearchTermForSessionList("");
      } catch (error) {
        console.error(
          "[useSessionFormUIManager] Error creating session:",
          error
        );
      }
    },
    [sessionState.currentSession, sessionActions]
  );

  // Handle session deletion from UI
  const handleSessionDelete = useCallback(
    async (sessionId: string) => {
      try {
        if (sessionId === sessionState.activeSessionId) {
          await sessionActions.deleteActiveSession();
        } else {
          await sessionActions.deleteNonActiveSession(sessionId);
        }
      } catch (error) {
        console.error(
          "[useSessionFormUIManager] Error deleting session:",
          error
        );
      }
    },
    [sessionState.activeSessionId, sessionActions]
  );

  // Handle session rename from UI
  const handleSessionRename = useCallback(
    async (sessionId: string, newName: string) => {
      try {
        if (sessionId === sessionState.activeSessionId) {
          await sessionActions.renameActiveSession(newName);
        } else {
          await sessionActions.renameSession(sessionId, newName);
        }
      } catch (error) {
        console.error(
          "[useSessionFormUIManager] Error renaming session:",
          error
        );
      }
    },
    [sessionState.activeSessionId, sessionActions]
  );

  // Filter sessions based on the search term
  const filterSessions = useCallback(
    (sessions: Session[]) => {
      if (!searchTermForSessionList.trim()) {
        return sessions;
      }

      const searchTerm = searchTermForSessionList.toLowerCase();
      return sessions.filter((session) =>
        session.name.toLowerCase().includes(searchTerm)
      );
    },
    [searchTermForSessionList]
  );

  return {
    // UI state
    isSessionSelectorOpen,
    searchTermForSessionList,

    // State setters
    setIsSessionSelectorOpen,
    setSearchTermForSessionList,
    toggleSessionSelector,

    // Session operations
    handleSessionSelect,
    handleSessionCreate,
    handleSessionDelete,
    handleSessionRename,

    // Helpers
    filterSessions,
  };
}
