"use client";

import { useEffect, type MutableRefObject } from "react";

import { getSessionsAction } from "@/actions";

interface UseAutoSessionLoaderProps {
  projectDirectory: string | undefined;
  activeSessionId: string | null;
  hasResolvedActiveSessionId: boolean;
  currentSession: any;
  isSessionLoading: boolean;
  loadSessionById: (sessionId: string) => Promise<void>;
  setAppInitializing: (initializing: boolean) => void;
  hasCompletedInitRef: MutableRefObject<boolean>;
}

export function useAutoSessionLoader({
  projectDirectory,
  activeSessionId,
  hasResolvedActiveSessionId,
  currentSession,
  isSessionLoading,
  loadSessionById,
  setAppInitializing,
  hasCompletedInitRef,
}: UseAutoSessionLoaderProps) {
  useEffect(() => {
    let isMounted = true;
    const completeInitialization = () => {
      if (!hasCompletedInitRef.current && isMounted) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
    };

    const run = async () => {
      if (!projectDirectory) {
        completeInitialization();
        return;
      }

      if (!hasResolvedActiveSessionId) {
        return;
      }

      if (!activeSessionId && !hasCompletedInitRef.current) {
        setAppInitializing(true);

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
          completeInitialization();
        }

        return;
      }

      if (!activeSessionId) {
        completeInitialization();
        return;
      }

      if (isSessionLoading || currentSession?.id === activeSessionId) {
        completeInitialization();
        return;
      }

      try {
        await loadSessionById(activeSessionId);
      } catch (error) {
        console.error("Error loading session:", error);
      } finally {
        completeInitialization();
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [projectDirectory, activeSessionId, hasResolvedActiveSessionId, currentSession?.id, isSessionLoading, loadSessionById, setAppInitializing, hasCompletedInitRef]);
}
