"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";

import { type BackgroundJob } from "@/types";

export interface UseBackgroundJobFetcherParams {
  initialLoad?: boolean;
}

/**
 * Hook for fetching job data from the Tauri backend
 *
 * Handles the data fetching logic for background jobs, including:
 * - Fetching jobs from the backend
 * - Tracking loading and error states
 * - Error handling and consecutive error tracking
 * - Performance monitoring
 */
export function useBackgroundJobFetcher({
  initialLoad: initialLoadParam = true,
}: UseBackgroundJobFetcherParams = {}) {
  // State for tracking loading and errors
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [initialLoad, setInitialLoad] = useState(initialLoadParam);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  // Refs for tracking state without triggering rerenders
  const isFetchingRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);

  // Fetch jobs from the Tauri backend
  const fetchJobs = useCallback(async () => {
    // Track the fetch start time for performance monitoring
    const fetchAttemptTime = new Date().toISOString();

    // Prevent multiple concurrent fetches
    if (isFetchingRef.current) {
      console.debug(
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

      console.debug(
        `[BackgroundJobs] [${fetchAttemptTime}] Fetching jobs: initialLoad=${initialLoad}`
      );

      // Performance tracking - measure fetch duration
      const fetchStartTime = performance.now();

      // Use Tauri command directly
      const jobsData = await invoke<BackgroundJob[]>("get_active_jobs_command");

      // Calculate fetch duration for monitoring
      const fetchDuration = performance.now() - fetchStartTime;

      console.debug(
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
        console.debug(
          `[BackgroundJobs] [${fetchAttemptTime}] Retrieved ${jobsData.length} jobs`
        );

        // Count jobs by status for easier monitoring
        const statusCounts = jobsData.reduce(
          (counts, job) => {
            counts[job.status] = (counts[job.status] || 0) + 1;
            return counts;
          },
          {} as Record<string, number>
        );

        console.debug(`[BackgroundJobs] Jobs by status:`, statusCounts);
      }

      return jobsData;
    } catch (err) {
      // Increment consecutive errors counter for monitoring
      consecutiveErrorsRef.current += 1;

      // Log the error with additional context
      console.error(
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

        console.debug(
          `[BackgroundJobs] [${fetchAttemptTime}] Initial load completed`
        );
      }
    }
  }, [initialLoad]);

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
  }, [fetchJobs]);

  return {
    // State
    isLoading,
    error,
    initialLoad,
    lastFetchTime,

    // Refs
    isFetchingRef,
    consecutiveErrorsRef,

    // Methods
    fetchJobs,
    refreshJobs,
  };
}
