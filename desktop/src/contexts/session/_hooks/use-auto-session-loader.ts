"use client";

import { useEffect, type MutableRefObject } from "react";

import { getSessionsAction } from "@/actions";

interface UseAutoSessionLoaderProps {
  projectDirectory: string | undefined;
  activeSessionId: string | null;
  currentSession: any;
  isSessionLoading: boolean;
  loadSessionById: (sessionId: string) => Promise<void>;
  setAppInitializing: (initializing: boolean) => void;
  hasCompletedInitRef: MutableRefObject<boolean>;
}

export function useAutoSessionLoader({
  projectDirectory,
  activeSessionId,
  currentSession,
  isSessionLoading,
  loadSessionById,
  setAppInitializing,
  hasCompletedInitRef,
}: UseAutoSessionLoaderProps) {
  useEffect(() => {
    let isMounted = true;
    if (!projectDirectory) {
      if (!hasCompletedInitRef.current && isMounted) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
      return;
    }

    if (!activeSessionId && !hasCompletedInitRef.current && isMounted) {
      setAppInitializing(true);
      
      const loadMostRecentSession = async () => {
        try {
          const sessionsResult = await getSessionsAction(projectDirectory);
          
          if (!isMounted) return;
          
          if (sessionsResult.isSuccess && sessionsResult.data && sessionsResult.data.length > 0) {
            const sortedSessions = sessionsResult.data.sort((a, b) => {
              const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
              const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
              return bTime - aTime;
            });
            
            if (!isMounted) return;
            await loadSessionById(sortedSessions[0].id);
          }
        } catch (error) {
          console.error("Error loading sessions:", error);
        } finally {
          if (isMounted) {
            hasCompletedInitRef.current = true;
            setAppInitializing(false);
          }
        }
      };

      loadMostRecentSession();
      return;
    }

    if (!activeSessionId) {
      if (!hasCompletedInitRef.current && isMounted) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
      return;
    }

    if (isSessionLoading || currentSession?.id === activeSessionId) {
      if (!hasCompletedInitRef.current && isMounted) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
      return;
    }

    loadSessionById(activeSessionId)
      .catch((error) => {
        console.error("Error loading session:", error);
      })
      .finally(() => {
        if (isMounted) {
          hasCompletedInitRef.current = true;
          setAppInitializing(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectDirectory, activeSessionId, currentSession?.id, isSessionLoading]);
}