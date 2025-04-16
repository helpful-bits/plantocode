"use client"; 

import React, { useEffect } from 'react';
import { Session } from '@/types'; // Keep Session import

interface SessionGuardProps {
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  getCurrentSessionState: () => Omit<Session, "id" | "name" | "updatedAt">;
  onLoadSession: (session: Session) => void;
  children: React.ReactNode;
  sessionInitialized: boolean; // Add sessionInitialized prop
}

const SessionGuard: React.FC<SessionGuardProps> = ({
  activeSessionId,
  sessionInitialized,
  children,
}) => { // Keep SessionGuard component
  useEffect(() => {
    console.log(`[SessionGuard] Rendering with activeSessionId=${activeSessionId}, sessionInitialized=${sessionInitialized}`);
  }, [activeSessionId, sessionInitialized]);
  
  // Modified conditional to consider both activeSessionId and sessionInitialized
  if (!activeSessionId && !sessionInitialized) {
    // If no session is active and not initialized, don't render the main form content
    console.log('[SessionGuard] Not rendering children - no active session and not initialized');
    return null; // Main form elements are hidden
  }
  // If a session is active or initialized, render the children (the main form)
  console.log('[SessionGuard] Rendering children - session is active or initialized');
  return <>{children}</>;
}; // Keep component definition
 
export default SessionGuard;
