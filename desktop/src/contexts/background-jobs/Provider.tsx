"use client";

import { createContext, useSyncExternalStore, useEffect, useMemo } from "react";

import { type BackgroundJob } from "@/types/session-types";
import { useProject } from "@/contexts/project-context";
import { useSessionStateContext } from "@/contexts/session";
import { useUILayout } from "@/contexts/ui-layout-context";

import { jobsStore } from "./store/jobsStore";

import type { ReactNode } from "react";

export type BackgroundJobsContextType = {
  jobs: BackgroundJob[];
  activeJobs: BackgroundJob[];
  isLoading: boolean;
  error: Error | null;
  cancelJob: (jobId: string) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  clearHistory: (daysToKeep?: number) => Promise<void>;
  refreshJobs: () => Promise<void>;
  getJobById: (jobId: string) => BackgroundJob | undefined;
  setViewedImplementationPlanId: (jobId: string | null) => Promise<void>;
};

// Create the context with default values
export const BackgroundJobsContext = createContext<BackgroundJobsContextType>({
  jobs: [],
  activeJobs: [],
  isLoading: false,
  error: null,
  cancelJob: async () => {},
  deleteJob: async () => {},
  clearHistory: async () => {},
  refreshJobs: async () => {},
  getJobById: () => undefined,
  setViewedImplementationPlanId: async () => {},
});

export function BackgroundJobsProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Get the current project directory from the project context
  const { projectDirectory } = useProject();

  // Get the active session ID and current session from the session context
  const { activeSessionId, currentSession } = useSessionStateContext();

  // Get user presence state
  const { isUserPresent } = useUILayout();

  // Use effective session ID with fallback to current session
  const effectiveSessionId = activeSessionId || currentSession?.id || undefined;

  // Configure the store when inputs change
  useEffect(() => {
    jobsStore.configure({
      projectDirectory: projectDirectory || undefined,
      sessionId: effectiveSessionId,
      isUserPresent,
    });
  }, [projectDirectory, effectiveSessionId, isUserPresent]);

  // Subscribe to the store
  const snap = useSyncExternalStore(jobsStore.subscribe, jobsStore.getSnapshot);

  // Memoize getJobById to prevent recreating on every render
  const getJobById = useMemo(
    () => (id: string) => snap.jobs.find((j) => j.id === id) || undefined,
    [snap.jobs]
  );

  // Memoize setViewedImplementationPlanId wrapper
  const setViewedImplementationPlanId = useMemo(
    () => async (jobId: string | null) => {
      await jobsStore.setViewedImplementationPlanId(jobId);
    },
    []
  );

  // Create context value with store actions (memoized)
  const contextValue: BackgroundJobsContextType = useMemo(
    () => ({
      jobs: snap.jobs,
      activeJobs: snap.activeJobs,
      isLoading: snap.isLoading,
      error: snap.error,
      cancelJob: jobsStore.cancelJob,
      deleteJob: jobsStore.deleteJob,
      clearHistory: jobsStore.clearHistory,
      refreshJobs: jobsStore.refreshJobs,
      getJobById,
      setViewedImplementationPlanId,
    }),
    [snap.jobs, snap.activeJobs, snap.isLoading, snap.error, getJobById, setViewedImplementationPlanId]
  );

  // Provide context values to children
  return (
    <BackgroundJobsContext.Provider value={contextValue}>
      {children}
    </BackgroundJobsContext.Provider>
  );
}
