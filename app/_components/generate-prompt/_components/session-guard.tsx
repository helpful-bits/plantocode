"use client"; 

import React, { useEffect, useState } from 'react';
import { Session } from '@/types'; // Keep Session import
import { Loader2, AlertCircle } from 'lucide-react';
import { sessionSyncService } from '@/lib/services/session-sync-service';
import { debugSessionState } from '@/lib/utils/session-debug';
import { Button } from '@/components/ui/button';

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
  const [showLoadingUI, setShowLoadingUI] = useState(false);
  const [loadingDuration, setLoadingDuration] = useState(0);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  
  // Track loading start time for detecting stuck loading states
  const loadingStartTimeRef = React.useRef<number | null>(null);
  
  // Detect when we're in a loading state
  useEffect(() => {
    if (activeSessionId && !sessionInitialized) {
      // If we have an active session ID but it's not initialized,
      // show loading UI after a short delay to prevent flashing
      const timer = setTimeout(() => {
        setShowLoadingUI(true);
        loadingStartTimeRef.current = Date.now();
      }, 300);
      
      // Start a timer to update the loading duration
      const durationTimer = setInterval(() => {
        if (loadingStartTimeRef.current) {
          setLoadingDuration(Math.floor((Date.now() - loadingStartTimeRef.current) / 1000));
        }
      }, 1000);
      
      return () => {
        clearTimeout(timer);
        clearInterval(durationTimer);
        loadingStartTimeRef.current = null;
        setLoadingDuration(0);
      };
    } else {
      setShowLoadingUI(false);
      loadingStartTimeRef.current = null;
      setLoadingDuration(0);
    }
  }, [activeSessionId, sessionInitialized]);
  
  // Log component state for debugging
  useEffect(() => {
    console.log(`[SessionGuard] Rendering with activeSessionId=${activeSessionId}, sessionInitialized=${sessionInitialized}, showLoadingUI=${showLoadingUI}`);
    
    if (activeSessionId) {
      const state = sessionSyncService.getSessionState(activeSessionId);
      console.log(`[SessionGuard] Session state from sync service: ${state}`);
      
      // If loading is taking too long (> 10 seconds), log detailed debug info
      if (showLoadingUI && loadingDuration > 10 && loadingDuration % 5 === 0) {
        console.warn(`[SessionGuard] Session loading taking a long time (${loadingDuration}s)`);
        debugSessionState(activeSessionId);
      }
    }
  }, [activeSessionId, sessionInitialized, showLoadingUI, loadingDuration]);
  
  // Handle debug button click
  const handleDebugClick = () => {
    setShowDebugInfo(true);
    if (activeSessionId) {
      debugSessionState(activeSessionId);
    } else {
      debugSessionState();
    }
    
    // Auto-hide debug info after 5 seconds
    setTimeout(() => setShowDebugInfo(false), 5000);
  };
  
  // Modified conditional to consider both activeSessionId and sessionInitialized
  // Render children ONLY if a session is active AND initialized
  if (activeSessionId && sessionInitialized) {
    console.log('[SessionGuard] Rendering children - session is active AND initialized');
    return <>{children}</>;
  } else if (activeSessionId && showLoadingUI) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading session data... {loadingDuration > 3 && `(${loadingDuration}s)`}</p>
        </div>
        <div className="w-full max-w-md h-2 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary animate-pulse rounded-full" style={{ width: '60%' }}></div>
        </div>
        
        {loadingDuration > 8 && (
          <div className="flex flex-col items-center gap-2 mt-4">
            <div className="flex items-center text-amber-500 gap-2">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Loading is taking longer than expected</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleDebugClick} 
              className="text-xs"
            >
              {showDebugInfo ? "Debug info logged to console" : "Debug Session"}
            </Button>
          </div>
        )}
      </div>
    );
  } else {
    console.log(`[SessionGuard] Not rendering children - activeSessionId=${activeSessionId}, sessionInitialized=${sessionInitialized}`);
    return null; // Main form elements are hidden
  }
}; // Keep component definition
 
export default SessionGuard;
