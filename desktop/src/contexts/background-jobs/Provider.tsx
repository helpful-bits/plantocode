"use client";

import { createContext } from "react";

import { type BackgroundJob } from "@/types/session-types";

import { useOrchestratedBackgroundJobsState } from "./_hooks";

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
});

export function BackgroundJobsProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Use the orchestrated background jobs state hook to manage all job-related state and functions
  const orchestratedState = useOrchestratedBackgroundJobsState();

  // Provide context values to children
  return (
    <BackgroundJobsContext.Provider value={orchestratedState}>
      {children}
    </BackgroundJobsContext.Provider>
  );
}
