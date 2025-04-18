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
  // Render children ONLY if a session is active AND initialized
  if (activeSessionId && sessionInitialized) {
    console.log('[SessionGuard] Rendering children - session is active AND initialized');
    return <>{children}</>;
  } else {
    console.log(`[SessionGuard] Not rendering children - activeSessionId=${activeSessionId}, sessionInitialized=${sessionInitialized}`);
    return null; // Main form elements are hidden
  }
}; // Keep component definition
 
export default SessionGuard;
