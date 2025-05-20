"use client";

import { type BackgroundJob } from "@/types/session-types";

import { useJobDataFetching } from "./useJobDataFetching";
import { useJobMutations } from "./useJobMutations";
import { useJobStateManagement } from "./useJobStateManagement";

export interface UseJobDataManagerParams {
  initialJobs?: BackgroundJob[];
}

/**
 * Main hook for managing background jobs data
 *
 * This hook orchestrates all aspects of job management:
 * - Core state management via useJobStateManagement
 * - Data fetching via useJobDataFetching
 * - Job mutations via useJobMutations
 *
 * It provides a unified interface for BackgroundJobsProvider
 */
export function useJobDataManager({
  initialJobs = [],
}: UseJobDataManagerParams = {}) {
  // Get state variables and setters from useJobStateManagement
  const {
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
    isFetchingRef,
    consecutiveErrorsRef,
  } = useJobStateManagement({ initialJobs });

  // Get data fetching functions from useJobDataFetching
  const { fetchJobs, refreshJobs } = useJobDataFetching({
    setJobs,
    setActiveJobs,
    setIsLoading,
    setError,
    setInitialLoad,
    setLastFetchTime,
    isFetchingRef,
    consecutiveErrorsRef,
    initialLoad,
  });

  // Get job mutation functions from useJobMutations
  const { cancelJob, deleteJob, clearHistory } = useJobMutations({
    setJobs,
    setActiveJobs,
    refreshJobs,
  });

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

    // Data fetching methods
    fetchJobs,
    refreshJobs,

    // Job mutation methods
    cancelJob,
    deleteJob,
    clearHistory,
  };
}
