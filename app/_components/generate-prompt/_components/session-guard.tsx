"use client";

import React, { useEffect } from 'react';

interface SessionGuardProps {
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void; // Function to update session ID
  getCurrentSessionState: () => any; // Function to get current state
  onLoadSession: (session: any) => void; // Function to load session data
  children: React.ReactNode;
}

const SessionGuard: React.FC<SessionGuardProps> = ({
  activeSessionId,
  children,
}) => {
  // If no active session, render nothing (or a placeholder/prompt to create/load)
  if (!activeSessionId) {
    return null; // Main form elements are hidden
  }
  // If a session is active, render the children (the main form)
  return <>{children}</>;
};

export default SessionGuard;
