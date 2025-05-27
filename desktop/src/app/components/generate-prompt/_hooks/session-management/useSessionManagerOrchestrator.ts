"use client";

import { useEffect } from "react";

import { type Session } from "@/types/session-types";

import { useSessionFormState } from "./useSessionFormState";
import { useSessionListState } from "./useSessionListState";
import { useSessionMutations } from "./useSessionMutations";
import { useSessionQueries } from "./useSessionQueries";

interface UseSessionManagerOrchestratorProps {
  projectDirectory: string;
  getCurrentSessionState: () => Omit<Session, "id" | "name" | "updatedAt">;
  onSessionNameChangeUISync: (name: string) => void;
}

/**
 * Orchestrator hook for session management
 * Combines form state, list state, queries, and mutations
 */
export function useSessionManagerOrchestrator({
  projectDirectory,
  getCurrentSessionState,
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
    deletedSessionIdsRef,
  } = useSessionListState();

  const { loadSessions } = useSessionQueries({
    projectDirectory,
    sessions,
    setSessions,
    setIsLoadingSessions,
    setSessionsError,
    pendingLoadRef,
    hasLoadedOnceRef,
    deletedSessionIdsRef,
  });

  const {
    createSession,
    updateSessionName,
    deleteSession,
    cloneSession,
    loadSessionDetail,
  } = useSessionMutations({
    projectDirectory,
    getCurrentSessionState,
    onSessionNameChangeUISync,
    loadSessions,
    setSessions,
    sessions,
    sessionNameInput,
    setSessionNameInput,
    editSessionNameInput,
    setEditingSessionId,
    deletedSessionIdsRef,
  });

  // Combined effect for project directory changes and session loading
  useEffect(() => {
    if (!projectDirectory) {
      setSessions([] as Session[], true); // Clear sessions if no project directory
      hasLoadedOnceRef.current = false; // Reset loaded state
      return;
    }

    // If projectDirectory changes, force a refresh.
    // loadSessions will handle isLoadingSessions and hasLoadedOnceRef.
    hasLoadedOnceRef.current = false; // Reset for new project
    loadSessions(true); // forceRefresh = true
  // This effect depends on projectDirectory and loadSessions.
  // setSessions is a stable setter and hasLoadedOnceRef is a ref - both don't need to be dependencies.
  }, [projectDirectory, loadSessions]);

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
    isLoading: isLoadingSessions,

    // Direct API access
    loadSessionsFromServer: loadSessions,
  };
}
