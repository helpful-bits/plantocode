import { createContext, useContext, useMemo, useEffect, useCallback, useRef } from "react";
import { listen } from '@tauri-apps/api/event';

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
import { registerSessionEventHandlers, initSessionEventBridge, disposeSessionEventBridge } from "./event-bridge";
import { setActiveSessionAction } from "@/actions/session/active.actions";

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
  const { setAppInitializing, isUserPresent, lastPresenceChangeTs } = useUILayout();

  // Use the session state hook to manage session state
  const sessionStateHook = useSessionState();

  // Create refs for internal state management
  const hasCompletedInitRef = useRef<boolean>(false);
  const loadingSessionRef = useRef<{ id: string | null; timestamp: number }>({
    id: null,
    timestamp: 0,
  });
  const previousProjectDirectoryRef = useRef<string | null>(null);
  const prevPresentRef = useRef<boolean>(isUserPresent);
  

  // Initialize the active session manager
  const activeSessionManager = useActiveSessionManager({
    projectDirectory: projectDirectory,
  });

  // Memoize the onNeedsSave callback for useSessionLoader
  // On session change, persist current session if modified (safety net with blur flush).
  // This guarantees durability even if debounce window has not elapsed.
  const handleNeedsSave = useCallback(async (sessionId: string) => {
    window.dispatchEvent(new CustomEvent('flush-file-selection-history'));
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

  const currentSessionId = sessionStateHook.currentSession?.id;

  // Initialize session event bridge on mount
  useEffect(() => {
    void initSessionEventBridge();
    return () => {
      void disposeSessionEventBridge();
    };
  }, []);

  useEffect(() => {
    if (!projectDirectory) return;

    const handleActiveSessionChanged = async (sessionId: string, dir: string) => {
      if (dir !== projectDirectory) return;
      if (sessionId === currentSessionId) return;
      await setActiveSessionAction(projectDirectory, sessionId, { broadcast: false });
      if (!isUserPresent) return;
      await sessionLoader.loadSessionById(sessionId);
    };

    const handleRemoteSessionCreated = async (session: { id: string; projectDirectory: string }) => {
      if (session.projectDirectory !== projectDirectory) return;
      if (session.id === currentSessionId) return;
      await setActiveSessionAction(projectDirectory, session.id, { broadcast: false });
      if (!isUserPresent) return;
      await sessionLoader.loadSessionById(session.id);
    };

    const unregister = registerSessionEventHandlers({
      onActiveSessionChanged: handleActiveSessionChanged,
      onRemoteSessionCreated: handleRemoteSessionCreated,
      onSessionListInvalidate: (dir) => {
        if (dir !== projectDirectory) return;
      }
    });

    return unregister;
  }, [projectDirectory, currentSessionId, sessionLoader, isUserPresent]);

  // Memoize individual session fields to reduce re-renders
  // Provider exposes memoized slices (e.g., sessionBasicFields, sessionFileFields) to reduce global re-render impact.
  // Combined with throttled startTransition updates, this keeps typing responsiveness high.
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
      applyFileSelectionUpdate: sessionActions.applyFileSelectionUpdate,
      applyBackendFileUpdate: sessionActions.applyBackendFileUpdate,
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
      sessionActions.applyFileSelectionUpdate,
      sessionActions.applyBackendFileUpdate,
      sessionLoader.loadSessionById,
    ]
  );


  // Listen for app close event to save modified sessions
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAppClose = async () => {
      window.dispatchEvent(new CustomEvent("flush-file-selection-history"));
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

  // Listen for backend auto-applied files and filter out user exclusions
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<{
          session_id: string;
          job_id: string;
          task_type: string;
          files: string[];
        }>('session:auto-files-applied', async (event) => {
          try {
            const payload = event.payload;

            // Only process for current session
            if (!sessionStateHook.currentSession?.id || payload.session_id !== sessionStateHook.currentSession.id) {
              return;
            }

            if (!isUserPresent) return;

            // Validate files array
            const files = Array.isArray(payload.files)
              ? payload.files.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
              : [];

            if (files.length === 0) {
              return;
            }

            // CRITICAL: Filter out files that are in forceExcludedFiles
            // Backend additions must never override manual user exclusions
            const excludedSet = new Set(sessionStateHook.currentSession.forceExcludedFiles);
            const filtered = files.filter((f) => !excludedSet.has(f));

            if (filtered.length === 0) {
              console.log('session:auto-files-applied: All files were already excluded by user, skipping');
              return;
            }

            // Use centralized action to ensure additive merge + dirty flag
            // This action already handles window event dispatch
            const source = payload.task_type === 'extended_path_finder'
              ? 'AI Path Finder'
              : (payload.task_type === 'file_relevance_assessment' ? 'AI Relevance' : 'backend');

            sessionActions.applyBackendFileUpdate(filtered, source);

          } catch (e) {
            console.warn('session:auto-files-applied handler error', e);
          }
        });
      } catch (e) {
        console.warn('Failed to setup session:auto-files-applied listener', e);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [sessionStateHook.currentSession?.id, sessionStateHook.currentSession?.forceExcludedFiles, sessionActions, isUserPresent]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<{
          sessionId: string;
          includedFiles: string[];
          forceExcludedFiles: string[];
        }>("session-files-updated", (e) => {
          const p = e.payload;

          if (!sessionStateHook.currentSession?.id || p.sessionId !== sessionStateHook.currentSession.id) {
            return;
          }

          if (!isUserPresent) return;

          sessionActions.updateCurrentSessionFields({
            includedFiles: p.includedFiles,
            forceExcludedFiles: p.forceExcludedFiles,
          });
        });
      } catch (err) {
        console.error("Failed to setup session-files-updated listener:", err);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [sessionStateHook.currentSession?.id, sessionActions, isUserPresent]);

  // Listen for task description updates from mobile/remote
  useEffect(() => {
    let unlistenHistory: (() => void) | null = null;

    const setupHistoryListener = async () => {
      try {
        unlistenHistory = await listen<{
          sessionId: string;
          taskDescription: string;
        }>("session-history-synced", (e) => {
          const p = e.payload;

          // Update task description for matching session
          if (sessionStateHook.currentSession?.id === p.sessionId) {
            if (!isUserPresent) return;
            sessionActions.updateCurrentSessionFields({
              taskDescription: p.taskDescription,
            });
          }
        });
      } catch (err) {
        console.error("Failed to setup session-history-synced listener:", err);
      }
    };

    setupHistoryListener();

    return () => {
      if (unlistenHistory) {
        unlistenHistory();
      }
    };
  }, [sessionStateHook.currentSession?.id, sessionActions, isUserPresent]);

  // Handle session-updated through event bridge with typing protection
  useEffect(() => {
    const unregister = registerSessionEventHandlers({
      onSessionUpdated: (session) => {
        if (!sessionStateHook.currentSession?.id || session.id !== sessionStateHook.currentSession.id) {
          return;
        }

        if (!isUserPresent) return;

        const editorFocused = (window as any).__taskDescriptionEditorFocused;

        // Shallow-compare non-task fields to detect meaningful changes
        const { taskDescription, includedFiles, forceExcludedFiles, ...otherFields } = session;
        const currentOtherFields = (({ taskDescription, includedFiles, forceExcludedFiles, ...rest }) => rest)(sessionStateHook.currentSession);

        const hasOtherChanges = Object.keys(otherFields).some(
          key => otherFields[key as keyof typeof otherFields] !== currentOtherFields[key as keyof typeof currentOtherFields]
        );

        // If editor is focused and only taskDescription changed, skip update
        if (editorFocused && !hasOtherChanges) {
          return;
        }

        // Apply update - preserve taskDescription during focused editing
        if (editorFocused) {
          sessionStateHook.setCurrentSession({
            ...session,
            taskDescription: sessionStateHook.currentSession.taskDescription,
          } as any);
        } else {
          // Always apply the update when editor is not focused
          // This ensures task description changes from jobs, mobile, etc. are reflected
          sessionStateHook.setCurrentSession(session);
        }

        sessionStateHook.setSessionModified(false);
      },
    });

    return unregister;
  }, [sessionStateHook, isUserPresent]);

  // Dev-only: Listen for session-field-validated events to verify synchronization
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<{
          sessionId: string;
          field: string;
          checksum: string;
          length: number;
        }>("session-field-validated", (e) => {
          const p = e.payload;

          if (!sessionStateHook.currentSession?.id || p.sessionId !== sessionStateHook.currentSession.id) {
            return;
          }

          console.debug(`[SessionValidation] ${p.field} validated - checksum: ${p.checksum.substring(0, 8)}, length: ${p.length}`);
        });
      } catch (err) {
        console.error("Failed to setup session-field-validated listener:", err);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [sessionStateHook.currentSession?.id]);

  useEffect(() => {
    const wasPresent = prevPresentRef.current;
    const nowPresent = isUserPresent;
    prevPresentRef.current = nowPresent;

    if (!wasPresent && nowPresent && activeSessionManager.activeSessionId) {
      sessionLoader.loadSessionById(activeSessionManager.activeSessionId);
    }
  }, [lastPresenceChangeTs, isUserPresent, activeSessionManager.activeSessionId, sessionLoader]);

  // Reset session state when project directory changes (but not on initial mount)
  useEffect(() => {
    if (!projectDirectory) return;

    // Check if this is a real change (not initial mount)
    if (previousProjectDirectoryRef.current !== null && previousProjectDirectoryRef.current !== projectDirectory) {
      console.log("Project directory changed from", previousProjectDirectoryRef.current, "to", projectDirectory, "- clearing session state");

      // Clear the current session data immediately to remove old task description and files from UI
      sessionStateHook.setCurrentSession(null);
      sessionStateHook.setSessionModified(false);
      sessionStateHook.setSessionError(null);

      // Clear active session ID without broadcasting to avoid loops
      sessionActions.setActiveSessionId(null).catch((err) => {
        console.error("Failed to clear active session on project change:", err);
      });
    }

    // Update the ref for next comparison
    previousProjectDirectoryRef.current = projectDirectory;
  }, [projectDirectory, sessionActions, sessionStateHook]);

  return (
    <SessionStateContext.Provider value={stateContextValue}>
      <SessionActionsContext.Provider value={actionsContextValue}>
        {children}
      </SessionActionsContext.Provider>
    </SessionStateContext.Provider>
  );
}
