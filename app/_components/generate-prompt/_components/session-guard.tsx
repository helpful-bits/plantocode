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
  setActiveSessionId,
  getCurrentSessionState,
  onLoadSession
}) => { // Keep SessionGuard component
  const [showLoadingUI, setShowLoadingUI] = useState(false);
  const [loadingDuration, setLoadingDuration] = useState(0);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [forceInitialized, setForceInitialized] = useState(false);
  const [forceAttempted, setForceAttempted] = useState(false);
  
  // Track loading start time for detecting stuck loading states
  const loadingStartTimeRef = React.useRef<number | null>(null);
  const sessionMonitor = React.useRef<{id: string | null, initialized: boolean}>({
    id: null,
    initialized: false
  });
  
  // Monitor session changes for debugging
  useEffect(() => {
    if (sessionMonitor.current.id !== activeSessionId || sessionMonitor.current.initialized !== sessionInitialized) {
      console.log(`[SessionGuard] Session state changed:`, {
        previousId: sessionMonitor.current.id,
        currentId: activeSessionId,
        previousInitialized: sessionMonitor.current.initialized,
        currentInitialized: sessionInitialized,
        forceInitialized
      });
      
      sessionMonitor.current = {
        id: activeSessionId,
        initialized: sessionInitialized
      };
      
      // Reset force attempted when session ID changes
      if (sessionMonitor.current.id !== activeSessionId) {
        setForceAttempted(false);
      }
    }
  }, [activeSessionId, sessionInitialized, forceInitialized]);
  
  // Detect when we're in a loading state
  useEffect(() => {
    if (activeSessionId && !sessionInitialized && !forceInitialized) {
      // If we have an active session ID but it's not initialized,
      // show loading UI after a short delay to prevent flashing
      const timer = setTimeout(() => {
        console.log(`[SessionGuard] Showing loading UI for session: ${activeSessionId}`);
        setShowLoadingUI(true);
        loadingStartTimeRef.current = Date.now();
      }, 300);
      
      // Start a timer to update the loading duration
      const durationTimer = setInterval(() => {
        if (loadingStartTimeRef.current) {
          const newDuration = Math.floor((Date.now() - loadingStartTimeRef.current) / 1000);
          setLoadingDuration(newDuration);
          
          // Log session state details more frequently
          if (newDuration % 3 === 0) {
            console.log(`[SessionGuard] Session loading in progress for ${newDuration}s`);
            if (newDuration > 5) {
              debugSessionState(activeSessionId);
            }
          }
          
          // Force initialization after 10 seconds to prevent being stuck forever
          if (newDuration > 10 && !sessionInitialized && !forceAttempted) {
            console.warn('[SessionGuard] Forcing session initialization after 10 seconds timeout');
            setForceAttempted(true);
            
            // First, clear any potential stuck operations
            sessionSyncService.clearStuckSession(activeSessionId);
            
            // Then use the more reliable force load method
            sessionSyncService.forceLoadSession(activeSessionId).then(session => {
              if (session) {
                console.log('[SessionGuard] Force loading session after timeout succeeded:', session.id);
                onLoadSession(session);
                setForceInitialized(true);
              } else {
                console.error('[SessionGuard] Failed to force load session after timeout');
              }
            }).catch(err => {
              console.error('[SessionGuard] Error force loading session after timeout:', err);
            });
          }
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
  }, [activeSessionId, sessionInitialized, forceInitialized, forceAttempted, onLoadSession]);
  
  // Reset force initialized when session changes
  useEffect(() => {
    if (sessionInitialized && (forceInitialized || forceAttempted)) {
      console.log(`[SessionGuard] Session ${activeSessionId} is now initialized, resetting force flags`);
      setForceInitialized(false);
      setForceAttempted(false);
    }
  }, [activeSessionId, sessionInitialized, forceInitialized, forceAttempted]);
  
  // Log component state for debugging
  useEffect(() => {
    console.log(`[SessionGuard] Rendering with activeSessionId=${activeSessionId}, sessionInitialized=${sessionInitialized}, showLoadingUI=${showLoadingUI}, forceInitialized=${forceInitialized}`);
    
    if (activeSessionId) {
      const state = sessionSyncService.getSessionState(activeSessionId);
      const isBusy = sessionSyncService.isSessionBusy(activeSessionId);
      console.log(`[SessionGuard] Session ${activeSessionId} state from sync service: ${state} (busy: ${isBusy})`);
      
      // If loading is taking too long (> 10 seconds), log detailed debug info
      if (showLoadingUI && loadingDuration > 10 && loadingDuration % 5 === 0) {
        console.warn(`[SessionGuard] Session loading taking a long time (${loadingDuration}s)`);
        debugSessionState(activeSessionId);
      }
    }
  }, [activeSessionId, sessionInitialized, showLoadingUI, loadingDuration, forceInitialized]);
  
  // Handle debug button click
  const handleDebugClick = () => {
    setShowDebugInfo(true);
    console.group('[SessionGuard] Manual Debug');
    console.log({
      activeSessionId,
      sessionInitialized,
      forceInitialized,
      forceAttempted,
      loadingDuration,
      showLoadingUI,
    });
    
    if (activeSessionId) {
      debugSessionState(activeSessionId);
    } else {
      debugSessionState();
    }
    console.groupEnd();
    
    // Auto-hide debug info after 5 seconds
    setTimeout(() => setShowDebugInfo(false), 5000);
  };

  // Add a button to force initialization if taking too long
  const handleForceInitialize = () => {
    if (activeSessionId) {
      console.log('[SessionGuard] Manually forcing session initialization');
      setForceAttempted(true);
      
      // First clear any stuck operations
      sessionSyncService.clearStuckSession(activeSessionId);
      
      // Use the reliable force load method
      sessionSyncService.forceLoadSession(activeSessionId).then(session => {
        if (session) {
          console.log('[SessionGuard] Force loading session succeeded:', session.id);
          onLoadSession(session);
          setForceInitialized(true);
        } else {
          console.error('[SessionGuard] Failed to force load session');
        }
      }).catch(err => {
        console.error('[SessionGuard] Error force loading session:', err);
      });
    }
  };
  
  // Modified conditional to consider both activeSessionId and sessionInitialized
  // Render children ONLY if a session is active AND initialized
  if (activeSessionId && (sessionInitialized || forceInitialized)) {
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
        
        {loadingDuration > 5 && (
          <div className="flex flex-col items-center gap-2 mt-4">
            <div className="flex items-center text-amber-500 gap-2">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Loading is taking longer than expected</span>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleDebugClick} 
                className="text-xs"
              >
                {showDebugInfo ? "Debug info logged to console" : "Debug Session"}
              </Button>
              
              {loadingDuration > 5 && !forceAttempted && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleForceInitialize}
                  className="text-xs"
                >
                  Force Continue
                </Button>
              )}
            </div>
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
