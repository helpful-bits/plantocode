"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";

import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { areJobArraysEqual } from "@/utils/job-comparison-utils";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "BackgroundJobsFetcher" });

export interface UseJobDataFetchingParams {
  // State setters
  setJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
  setActiveJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<Error | null>>;
  setInitialLoad: React.Dispatch<React.SetStateAction<boolean>>;
  setLastFetchTime: React.Dispatch<React.SetStateAction<number>>;

  // Refs
  isFetchingRef: React.MutableRefObject<boolean>;
  consecutiveErrorsRef: React.MutableRefObject<number>;

  // State values needed for logic
  initialLoad: boolean;
}

/**
 * Hook for fetching job data from the Tauri backend
 *
 * Handles the data fetching logic for background jobs, including:
 * - Fetching jobs using Tauri commands
 * - Updating state based on response data
 * - Error handling and tracking
 * - Performance monitoring
 */
export function useJobDataFetching({
  setJobs,
  setActiveJobs,
  setIsLoading,
  setError,
  setInitialLoad,
  setLastFetchTime,
  isFetchingRef,
  consecutiveErrorsRef,
  initialLoad,
}: UseJobDataFetchingParams) {
  // Fetch jobs from the Tauri backend
  const fetchJobs = useCallback(async () => {
    // Track the fetch start time for performance monitoring
    const fetchAttemptTime = new Date().toISOString();

    // Prevent multiple concurrent fetches
    if (isFetchingRef.current) {
      logger.debug(
        `[BackgroundJobs] [${fetchAttemptTime}] Skipping fetch - already in progress`
      );
      return null;
    }

    // Set the fetching flag before any async operations
    isFetchingRef.current = true;

    try {
      // Clear previous error state when starting a new fetch
      setError(null);

      // Only show loading state on initial load, not during polling
      // This prevents UI flicker during background updates
      if (initialLoad) {
        setIsLoading(true);
      }

      logger.debug(
        `[BackgroundJobs] [${fetchAttemptTime}] Fetching jobs: initialLoad=${initialLoad}`
      );

      // Performance tracking - measure fetch duration
      const fetchStartTime = performance.now();

      // Use Tauri command
      const jobsData = await invoke<BackgroundJob[]>("get_active_jobs_command");

      // Calculate fetch duration for monitoring
      const fetchDuration = performance.now() - fetchStartTime;

      logger.debug(
        `[BackgroundJobs] [${fetchAttemptTime}] Fetch completed in ${Math.round(fetchDuration)}ms with success`
      );

      // Record the fetch time for tracking
      const fetchTimeMs = Date.now();
      setLastFetchTime(fetchTimeMs);

      // Reset consecutive errors on success
      consecutiveErrorsRef.current = 0;

      // Enhanced logging with job status breakdown for monitoring
      if (jobsData.length > 0) {
        // Log job details for debugging
        logger.debug(
          `[BackgroundJobs] [${fetchAttemptTime}] Retrieved ${jobsData.length} jobs`
        );

        // Count jobs by status for easier monitoring
        const statusCounts = jobsData.reduce(
          (counts: Record<string, number>, job: BackgroundJob) => {
            counts[job.status] = (counts[job.status] || 0) + 1;
            return counts;
          },
          {} as Record<string, number>
        );

        logger.debug(`[BackgroundJobs] Jobs by status:`, statusCounts);
      }

      // Update jobs using functional update pattern
      setJobs((prevJobs) => {
        // Only update if jobs have changed - uses the areJobArraysEqual helper
        // This avoids unnecessary re-renders
        if (!areJobArraysEqual(prevJobs, jobsData)) {
          logger.debug(
            `[BackgroundJobs] [${fetchAttemptTime}] Jobs array updated with ${jobsData.length} jobs`
          );
          return jobsData;
        }

        logger.debug(
          `[BackgroundJobs] [${fetchAttemptTime}] No changes in jobs array detected`
        );
        return prevJobs;
      });

      // Update active jobs using functional update pattern
      setActiveJobs((prevActiveJobs) => {
        // Filter for active jobs only using the JOB_STATUSES constant
        const activeJobsList = jobsData.filter((job: BackgroundJob) =>
          JOB_STATUSES.ACTIVE.includes(job.status)
        );

        // Only update active jobs if they've changed
        if (!areJobArraysEqual(prevActiveJobs, activeJobsList)) {
          logger.debug(
            `[BackgroundJobs] [${fetchAttemptTime}] Active jobs updated with ${activeJobsList.length} jobs`
          );
          return activeJobsList;
        }

        logger.debug(
          `[BackgroundJobs] [${fetchAttemptTime}] No changes in active jobs detected`
        );
        return prevActiveJobs;
      });

      return jobsData;
    } catch (err) {
      // Increment consecutive errors counter for monitoring
      consecutiveErrorsRef.current += 1;

      // Log the error with additional context
      logger.error(
        `[BackgroundJobs] [${fetchAttemptTime}] Error fetching jobs (attempt #${consecutiveErrorsRef.current}):`,
        err
      );

      // Update error state for UI display
      setError(err instanceof Error ? err : new Error(String(err)));

      // Don't reset existing jobs state on error to prevent UI flicker
      // The next successful fetch will update the state
      return null;
    } finally {
      // ALWAYS reset the fetching flag to allow future fetches
      isFetchingRef.current = false;

      // Only update loading and initialLoad state if this was the initial load
      if (initialLoad) {
        setIsLoading(false);
        setInitialLoad(false);

        logger.debug(
          `[BackgroundJobs] [${fetchAttemptTime}] Initial load completed`
        );
      }
    }
  }, [
    initialLoad,
    setJobs,
    setActiveJobs,
    setError,
    setIsLoading,
    setInitialLoad,
    setLastFetchTime,
  ]);

  // Manual refresh function for jobs - simplified version that delegates to fetchJobs
  const refreshJobs = useCallback(async (): Promise<void> => {
    // Skip if already fetching to prevent overlapping requests
    if (isFetchingRef.current) {
      return;
    }

    // Show loading indicator for manual refresh
    setIsLoading(true);

    try {
      await fetchJobs();
    } finally {
      // Always reset UI state
      setIsLoading(false);
    }
  }, [fetchJobs, setIsLoading]);

  return {
    fetchJobs,
    refreshJobs,
  };
}
