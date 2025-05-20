"use client";

import { useState } from "react";

import { type Session } from "@/types/session-types";

/**
 * Hook to manage session form state for creating and editing sessions
 */
export function useSessionFormState() {
  // State for new session creation
  const [sessionNameInput, setSessionNameInput] = useState("");

  // State for session editing
  const [editSessionNameInput, setEditSessionNameInput] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  /**
   * Start editing a session name
   */
  const startEditingSession = (session: Session) => {
    setEditingSessionId(session.id);
    setEditSessionNameInput(session.name || "");
  };

  /**
   * Cancel editing a session name
   */
  const cancelEditingSession = () => {
    setEditingSessionId(null);
  };

  return {
    // New session state
    sessionNameInput,
    setSessionNameInput,

    // Edit session state
    editSessionNameInput,
    setEditSessionNameInput,
    editingSessionId,
    setEditingSessionId,

    // Session editing actions
    startEditingSession,
    cancelEditingSession,
  };
}
