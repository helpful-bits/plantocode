"use client";

import { useRef, useState } from "react";

import { type BackgroundJob } from "@/types/session-types";

import { NON_TERMINAL_JOB_STATUSES } from "../_utils/job-status-utils";

export interface UseJobStateManagementParams {
  initialJobs?: BackgroundJob[];
}

/**
 * Hook for managing basic state variables and refs for background jobs
 *
 * This hook initializes and maintains:
 * - Core state: jobs, activeJobs, loading, error
 * - Lifecycle states: initialLoad, lastFetchTime
 * - Reference tracking: isFetchingRef, consecutiveErrorsRef
 */
export function useJobStateManagement({
  initialJobs = [],
}: UseJobStateManagementParams = {}) {
  // Core state
  const [jobs, setJobs] = useState<BackgroundJob[]>(initialJobs);
  const [activeJobs, setActiveJobs] = useState<BackgroundJob[]>(
    initialJobs.filter((job) => NON_TERMINAL_JOB_STATUSES.includes(job.status))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  // Refs for tracking state without triggering rerenders
  const isFetchingRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);

  return {
    // State
    jobs,
    setJobs,
    activeJobs,
    setActiveJobs,
    isLoading,
    setIsLoading,
    error,
    setError,
    initialLoad,
    setInitialLoad,
    lastFetchTime,
    setLastFetchTime,

    // Refs
    isFetchingRef,
    consecutiveErrorsRef,
  };
}
