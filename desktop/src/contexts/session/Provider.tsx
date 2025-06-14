import { createContext, useContext, useMemo, useEffect, useCallback, useRef } from "react";

import { useProject } from "@/contexts/project-context";
import { useUILayout } from "@/contexts/ui-layout-context";
import { logError } from "@/utils/error-handling";

import { useActiveSessionManager } from "./_hooks/use-active-session-manager";
import { useSessionActions } from "./_hooks/use-session-actions";
import { useSessionLoader } from "./_hooks/use-session-loader";
import { useAutoSessionLoader } from "./_hooks/use-auto-session-loader";
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
    const error = new Error(
      "useSessionStateContext must be used within a SessionProvider"
    );
    logError(error, "Session State Context - Hook Used Outside Provider").catch(() => {});
    throw error;
  }
  return context;
}

export function useSessionActionsContext(): SessionActionsContextType {
  const context = useContext(SessionActionsContext);
  if (!context) {
    const error = new Error(
      "useSessionActionsContext must be used within a SessionProvider"
    );
    logError(error, "Session Actions Context - Hook Used Outside Provider").catch(() => {});
    throw error;
  }
  return context;
}

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const { projectDirectory } = useProject();
  const { setAppInitializing } = useUILayout();

  // Use the session state hook to manage session state
  const sessionStateHook = useSessionState();

  // Create refs for internal state management
  const hasCompletedInitRef = useRef<boolean>(false);
  const loadingSessionRef = useRef<{ id: string | null; timestamp: number }>({
    id: null,
    timestamp: 0,
  });
  

  // Initialize the active session manager
  const activeSessionManager = useActiveSessionManager({
    projectDirectory: projectDirectory,
  });

  // Memoize the onNeedsSave callback for useSessionLoader
  const handleNeedsSave = useCallback(async (sessionId: string) => {
    if (
      sessionStateHook.isSessionModified &&
      sessionStateHook.currentSession?.id === sessionId
    ) {
      // Import the save action directly to avoid circular dependency
      const { saveSessionAction } = await import("@/actions");
      try {
        const result = await saveSessionAction(sessionStateHook.currentSession);
        if (result.isSuccess) {
          sessionStateHook.setSessionModified(false);
          return true;
        }
      } catch (error) {
        console.error("Failed to save session in onNeedsSave:", error);
      }
    }
    return false;
  }, [sessionStateHook.isSessionModified, sessionStateHook.currentSession, sessionStateHook.setSessionModified]);

  // Initialize the session loader
  const sessionLoader = useSessionLoader({
    currentSession: sessionStateHook.currentSession,
    setCurrentSession: sessionStateHook.setCurrentSession,
    setSessionLoading: sessionStateHook.setSessionLoading,
    setSessionModified: sessionStateHook.setSessionModified,
    setSessionError: sessionStateHook.setSessionError,
    hasCompletedInitRef,
    loadingSessionRef,
    setActiveSessionIdGlobally: activeSessionManager.updateActiveSessionId,
    onNeedsSave: handleNeedsSave,
  });

  // Initialize auto session loader
  useAutoSessionLoader({
    projectDirectory,
    activeSessionId: activeSessionManager.activeSessionId,
    currentSession: sessionStateHook.currentSession,
    isSessionLoading: sessionStateHook.isSessionLoading,
    loadSessionById: sessionLoader.loadSessionById,
    setAppInitializing,
    hasCompletedInitRef,
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


  // Memoize individual session fields to reduce re-renders
  const sessionBasicFields = useMemo(() => ({
    id: sessionStateHook.currentSession?.id,
    name: sessionStateHook.currentSession?.name,
    projectDirectory: sessionStateHook.currentSession?.projectDirectory,
  }), [
    sessionStateHook.currentSession?.id,
    sessionStateHook.currentSession?.name,
    sessionStateHook.currentSession?.projectDirectory,
  ]);

  const sessionFileFields = useMemo(() => ({
    includedFiles: sessionStateHook.currentSession?.includedFiles,
    forceExcludedFiles: sessionStateHook.currentSession?.forceExcludedFiles,
  }), [
    sessionStateHook.currentSession?.includedFiles,
    sessionStateHook.currentSession?.forceExcludedFiles,
  ]);

  const stateContextValue = useMemo<SessionStateContextType>(
    () => ({
      // Active session ID from manager
      activeSessionId: activeSessionManager.activeSessionId,

      // Current session data
      currentSession: sessionStateHook.currentSession,
      isSessionLoading: sessionStateHook.isSessionLoading,
      isSessionModified: sessionStateHook.isSessionModified,
      sessionError: sessionStateHook.sessionError,

      // Memoized session field accessors
      sessionBasicFields,
      sessionFileFields,
    }),
    [
      // Primitive values that should trigger re-memoization
      activeSessionManager.activeSessionId,
      sessionStateHook.currentSession,
      sessionStateHook.isSessionLoading,
      sessionStateHook.isSessionModified,
      sessionStateHook.sessionError,
      sessionBasicFields,
      sessionFileFields,
    ]
  );

  const actionsContextValue = useMemo<SessionActionsContextType>(
    () => ({
      // Basic state setters
      setCurrentSession: sessionStateHook.setCurrentSession,
      setSessionLoading: sessionStateHook.setSessionLoading,
      setSessionModified: sessionStateHook.setSessionModified,
      setActiveSessionId: sessionActions.setActiveSessionId,

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
      renameSession: sessionActions.renameSession,
    }),
    [
      // Stable function references from hooks that use useCallback internally
      sessionStateHook.setCurrentSession,
      sessionStateHook.setSessionLoading,
      sessionStateHook.setSessionModified,
      // Destructure sessionActions to individual stable callbacks
      sessionActions.setActiveSessionId,
      sessionActions.updateCurrentSessionFields,
      sessionActions.saveCurrentSession,
      sessionActions.flushSaves,
      sessionActions.createNewSession,
      sessionActions.deleteActiveSession,
      sessionActions.deleteNonActiveSession,
      sessionActions.renameActiveSession,
      sessionActions.renameSession,
      sessionLoader.loadSessionById,
    ]
  );


  // Listen for app close event to save modified sessions
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAppClose = async () => {
      if (sessionStateHook.isSessionModified && sessionStateHook.currentSession) {
        try {
          await sessionActions.saveCurrentSession();
        } catch (error) {
          console.error("Failed to save session on app close:", error);
        }
      }
    };

    window.addEventListener("app-will-close", handleAppClose);
    
    return () => {
      window.removeEventListener("app-will-close", handleAppClose);
    };
  }, [
    sessionStateHook.isSessionModified,
    sessionStateHook.currentSession,
    sessionActions.saveCurrentSession,
  ]);

  return (
    <SessionStateContext.Provider value={stateContextValue}>
      <SessionActionsContext.Provider value={actionsContextValue}>
        {children}
      </SessionActionsContext.Provider>
    </SessionStateContext.Provider>
  );
}
