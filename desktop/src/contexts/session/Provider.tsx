import { createContext, useContext, useMemo } from "react";

import { useProject } from "@/contexts/project-context";

import { useActiveSessionManager } from "./_hooks/use-active-session-manager";
import { useSessionActions } from "./_hooks/use-session-actions";
import { useSessionLoader } from "./_hooks/use-session-loader";
import { useSessionState } from "./_hooks/use-session-state";
import {
  type SessionStateContextType,
  type SessionActionsContextType,
} from "./_types/session-context-types";

import type { ReactNode } from "react";

const SessionStateContext = createContext<SessionStateContextType | null>(null);
const SessionActionsContext = createContext<SessionActionsContextType | null>(
  null
);

export function useSessionStateContext(): SessionStateContextType {
  const context = useContext(SessionStateContext);
  if (!context) {
    throw new Error(
      "useSessionStateContext must be used within a SessionProvider"
    );
  }
  return context;
}

export function useSessionActionsContext(): SessionActionsContextType {
  const context = useContext(SessionActionsContext);
  if (!context) {
    throw new Error(
      "useSessionActionsContext must be used within a SessionProvider"
    );
  }
  return context;
}

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const { projectDirectory } = useProject();

  // Use the session state hook to manage session state
  const sessionStateHook = useSessionState();

  // Initialize the active session manager
  const activeSessionManager = useActiveSessionManager({
    projectDirectory: projectDirectory,
  });

  // Initialize the session loader
  const sessionLoader = useSessionLoader({
    currentSession: sessionStateHook.currentSession,
    setCurrentSession: sessionStateHook.setCurrentSession,
    setSessionLoading: sessionStateHook.setSessionLoading,
    setSessionModified: sessionStateHook.setSessionModified,
    setSessionError: sessionStateHook.setSessionError,
    hasCompletedInitRef: sessionStateHook.hasCompletedInitRef,
    loadingSessionRef: sessionStateHook.loadingSessionRef,
    setActiveSessionIdGlobally: activeSessionManager.updateActiveSessionId,
    onNeedsSave: async (sessionId) => {
      if (
        sessionStateHook.isSessionModified &&
        sessionStateHook.currentSession?.id === sessionId
      ) {
        await sessionActions.saveCurrentSession();
        return true;
      }
      return false;
    },
  });

  // Initialize session actions
  const sessionActions = useSessionActions({
    currentSession: sessionStateHook.currentSession,
    isSessionModified: sessionStateHook.isSessionModified,
    setCurrentSession: sessionStateHook.setCurrentSession,
    setSessionModified: sessionStateHook.setSessionModified,
    setSessionError: sessionStateHook.setSessionError,
    setActiveSessionIdGlobally: activeSessionManager.updateActiveSessionId,
    onSessionNeedsReload: sessionLoader.loadSessionById,
  });


  const stateContextValue = useMemo<SessionStateContextType>(
    () => ({
      // Active session ID from manager
      activeSessionId: activeSessionManager.activeSessionId,

      // Current session data
      currentSession: sessionStateHook.currentSession,
      isSessionLoading: sessionStateHook.isSessionLoading,
      isSessionModified: sessionStateHook.isSessionModified,
      sessionError: sessionStateHook.sessionError || null,
    }),
    [
      activeSessionManager.activeSessionId,
      sessionStateHook.currentSession,
      sessionStateHook.isSessionLoading,
      sessionStateHook.isSessionModified,
      sessionStateHook.sessionError,
    ]
  );

  const actionsContextValue = useMemo<SessionActionsContextType>(
    () => ({
      // Basic state setters
      setCurrentSession: sessionStateHook.setCurrentSession,
      setSessionLoading: sessionStateHook.setSessionLoading,
      setSessionModified: sessionStateHook.setSessionModified,
      setActiveSessionId: activeSessionManager.updateActiveSessionId,

      // Session field updates
      updateCurrentSessionFields: sessionActions.updateCurrentSessionFields,

      // Session operations
      saveCurrentSession: sessionActions.saveCurrentSession,
      flushSaves: sessionActions.flushSaves,
      loadSessionById: sessionLoader.loadSessionById,
      createNewSession: sessionActions.createNewSession,
      deleteActiveSession: sessionActions.deleteActiveSession,
      deleteNonActiveSession: sessionActions.deleteNonActiveSession,
      renameActiveSession: sessionActions.renameActiveSession,
    }),
    [
      activeSessionManager.updateActiveSessionId,
      sessionStateHook.setCurrentSession,
      sessionStateHook.setSessionLoading,
      sessionStateHook.setSessionModified,
      sessionActions.updateCurrentSessionFields,
      sessionActions.saveCurrentSession,
      sessionActions.flushSaves,
      sessionLoader.loadSessionById,
      sessionActions.createNewSession,
      sessionActions.deleteActiveSession,
      sessionActions.deleteNonActiveSession,
      sessionActions.renameActiveSession,
    ]
  );

  return (
    <SessionStateContext.Provider value={stateContextValue}>
      <SessionActionsContext.Provider value={actionsContextValue}>
        {children}
      </SessionActionsContext.Provider>
    </SessionStateContext.Provider>
  );
}
