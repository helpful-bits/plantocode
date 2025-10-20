"use client";

import { useEffect, useMemo } from "react";

import { type Session } from "@/types/session-types";

import { useSessionFormState } from "./useSessionFormState";
import { useSessionListState } from "./useSessionListState";
import { useSessionMutations } from "./useSessionMutations";
import { useSessionQueries } from "./useSessionQueries";

interface UseSessionManagerOrchestratorProps {
  projectDirectory: string;
}

/**
 * Orchestrator hook for session management
 * Combines form state, list state, queries, and mutations
 */
export function useSessionManagerOrchestrator({
  projectDirectory,
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
    searchQuery,
    setSearchQuery,
    sessionListVersion,
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
    loadSessions,
    setSessions,
    sessions,
    sessionNameInput,
    setSessionNameInput,
    editSessionNameInput,
    setEditSessionNameInput,
    setEditingSessionId,
    deletedSessionIdsRef,
  });

  const filteredSessions = useMemo(() => {
    if (!searchQuery) {
      return sessions;
    }
    
    const lowerSearchQuery = searchQuery.toLowerCase();
    return sessions.filter(session => 
      session.name.toLowerCase().includes(lowerSearchQuery) ||
      session.taskDescription?.toLowerCase().includes(lowerSearchQuery) ||
      session.searchTerm?.toLowerCase().includes(lowerSearchQuery)
    );
  }, [sessions, searchQuery]);

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

  useEffect(() => {
    if (!projectDirectory) return;
    if (!hasLoadedOnceRef.current) return;

    loadSessions(false);
  }, [sessionListVersion, projectDirectory, loadSessions]);

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
    filteredSessions,
    isLoadingSessions,
    error: sessionsError,

    // Search state
    searchQuery,
    setSearchQuery,

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
