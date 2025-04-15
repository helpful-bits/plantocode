"use client"; 

import React from 'react'; // Keep React import
import { Session } from '@/types';

interface SessionGuardProps {
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  getCurrentSessionState: () => Omit<Session, "id" | "name" | "updatedAt">;
  onLoadSession: (session: Session) => void;
  children: React.ReactNode;
}

const SessionGuard: React.FC<SessionGuardProps> = ({
  activeSessionId, // Destructure activeSessionId from props
  children,
}) => {
  if (!activeSessionId) {
    // If no session is active, don't render the main form content
    return null; // Main form elements are hidden
  }
  // If a session is active, render the children (the main form)
  return <>{children}</>;
};
 
export default SessionGuard;
