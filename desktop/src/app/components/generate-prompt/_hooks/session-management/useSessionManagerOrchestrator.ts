"use client";

import { useEffect } from "react";

import { type Session } from "@/types/session-types";
import { normalizePath } from "@/utils/path-utils";

import { useSessionFormState } from "./useSessionFormState";
import { useSessionListState } from "./useSessionListState";
import { useSessionMutations } from "./useSessionMutations";
import { useSessionQueries } from "./useSessionQueries";

interface UseSessionManagerOrchestratorProps {
  projectDirectory: string;
  getCurrentSessionState: () => Omit<Session, "id" | "name" | "updatedAt">;
  onLoadSessionUISync: (session: Session) => void;
  onSessionNameChangeUISync: (name: string) => void;
}

/**
 * Orchestrator hook for session management
 * Combines form state, list state, queries, and mutations
 */
export function useSessionManagerOrchestrator({
  projectDirectory,
  getCurrentSessionState,
  onLoadSessionUISync,
  onSessionNameChangeUISync,
}: UseSessionManagerOrchestratorProps) {
  // Initialize the smaller, focused hooks
  const {
    sessionNameInput,
    setSessionNameInput,
    editSessionNameInput,
    setEditSessionNameInput,
    editingSessionId,
    setEditingSessionId,
    startEditingSession,
    cancelEditingSession,
  } = useSessionFormState();

  const {
    sessions,
    setSessions,
    isLoadingSessions,
    setIsLoadingSessions,
    sessionsError,
    setSessionsError,
    pendingLoadRef,
    hasLoadedOnceRef,
    lastFetchTimeRef,
    deletedSessionIdsRef,
  } = useSessionListState();

  const { loadSessions } = useSessionQueries({
    projectDirectory,
    onLoadSessionUISync,
    onSessionNameChangeUISync,
    sessions,
    setSessions,
    setIsLoadingSessions,
    setSessionsError,
    pendingLoadRef,
    hasLoadedOnceRef,
    lastFetchTimeRef,
    deletedSessionIdsRef,
  });

  const {
    createSession,
    updateSessionName,
    deleteSession,
    cloneSession,
    loadSessionDetail,
    isMutating,
  } = useSessionMutations({
    projectDirectory,
    getCurrentSessionState,
    onSessionNameChangeUISync,
    loadSessions,
    setSessions,
    sessionNameInput,
    setSessionNameInput,
    editSessionNameInput,
    editingSessionId,
    setEditingSessionId,
    deletedSessionIdsRef,
  });

  // Initial load on mount and when projectDirectory changes
  useEffect((): void => {
    if (!projectDirectory) return undefined;

    const normalizedDir = Promise.resolve(normalizePath(projectDirectory));
    const lastLoadedDir = lastFetchTimeRef.current ? Promise.resolve(normalizedDir) : null;

    // Only load sessions if project directory changed or sessions haven't been loaded yet
    if (lastLoadedDir !== normalizedDir || hasLoadedOnceRef.current === false) {
      if (lastLoadedDir !== normalizedDir) {
        // Project directory changed
      } else {
        // Project directory unchanged but no sessions loaded
      }

      // Use a timeout to avoid immediate triggers on mount and allow batching of rapid changes
      setTimeout(() => {
        if (!pendingLoadRef.current) {
          void loadSessions();
        }
      }, 100);

      return undefined;
    }
    
    return undefined;
  }, [
    projectDirectory,
    loadSessions,
    pendingLoadRef,
    hasLoadedOnceRef,
    lastFetchTimeRef,
  ]);

  // Adapter for compatibility with existing components
  const startEditingSessionWrapper = (
    session: Session,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    startEditingSession(session);
  };

  // Adapter for compatibility with existing components
  const cancelEditingWrapper = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation();
    cancelEditingSession();
  };

  // Adapter for compatibility with existing components
  const handleCloneSessionWrapper = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    void cloneSession(session);
  };

  return {
    // Session list state
    sessions,
    isLoadingSessions,
    error: sessionsError,

    // Session form state
    sessionNameInput,
    setSessionNameInput,
    editSessionNameInput,
    setEditSessionNameInput,
    editingSessionId,

    // Session actions with wrapper compatibility
    handleSaveNewSession: createSession,
    handleUpdateSessionName: updateSessionName,
    handleDeleteSession: deleteSession,
    handleLoadSessionWrapper: loadSessionDetail,
    handleCloneSessionWrapper,
    startEditingSessionWrapper,
    cancelEditingWrapper,

    // General state
    isLoading: isLoadingSessions || isMutating,

    // Direct API access
    loadSessionsFromServer: loadSessions,
  };
}
