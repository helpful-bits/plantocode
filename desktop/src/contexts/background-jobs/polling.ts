"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect } from "react";

import { type BackgroundJob, JOB_STATUSES } from "@/types";
import { areJobArraysEqual } from "@/utils/job-comparison-utils";

// Polling interval in milliseconds
export const POLLING_INTERVAL = 1500;

interface UseBackgroundJobsPollingParams {
  setJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
  setActiveJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<Error | null>>;
  setLastFetchTime: React.Dispatch<React.SetStateAction<number>>;
  setInitialLoad: React.Dispatch<React.SetStateAction<boolean>>;
  isFetchingRef: React.MutableRefObject<boolean>;
  initialLoad: boolean;
  pollingEnabled: boolean;
  consecutiveErrorsRef: React.MutableRefObject<number>;
}

/**
 * Hook for polling background jobs
 *
 * This hook handles background job fetching and polling logic, extracted from
 * the original background jobs context for better modularity.
 */
export function useBackgroundJobsPolling({
  setJobs,
  setActiveJobs,
  setIsLoading,
  setError,
  setLastFetchTime,
  setInitialLoad,
  isFetchingRef,
  initialLoad,
  pollingEnabled,
  consecutiveErrorsRef,
}: UseBackgroundJobsPollingParams) {
  // Fetch jobs from Tauri backend
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

      // Use Tauri command
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
          `[BackgroundJobs] [${fetchAttemptTime}] Retrieved ${jobsData.length} jobs, including:`,
          jobsData.map((job) => ({
            id: job.id,
            status: job.status,
            taskType: job.taskType,
            updatedAt: new Date(job.updatedAt || 0).toISOString(),
          }))
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

      // Update jobs using functional update pattern to avoid dependency on current jobs state
      // Log job types for debugging
      // Commented out console.log to fix linting error
      // console.log(
      //   "[BackgroundJobs] Job types found:",
      //   jobsData.map((job) => ({
      //     id: job.id,
      //     type: job.taskType,
      //     status: job.status,
      //     updatedAt: new Date(job.updatedAt || 0)
      //       .toISOString()
      //       .substring(0, 19),
      //   }))
      // );

      setJobs((prevJobs) => {
        // Only update if jobs have changed to avoid unnecessary re-renders
        if (!areJobArraysEqual(prevJobs, jobsData)) {
          console.debug(
            `[BackgroundJobs] [${fetchAttemptTime}] Jobs array updated with ${jobsData.length} jobs`
          );
          return jobsData;
        }

        console.debug(
          `[BackgroundJobs] [${fetchAttemptTime}] No changes in jobs array detected`
        );
        return prevJobs;
      });

      // Update active jobs using functional update pattern
      setActiveJobs((prevActiveJobs) => {
        // Filter for active jobs only using the JOB_STATUSES constant
        const activeJobsList = jobsData.filter((job) =>
          JOB_STATUSES.ACTIVE.includes(job.status)
        );

        // Only update active jobs if they've changed
        if (!areJobArraysEqual(prevActiveJobs, activeJobsList)) {
          console.debug(
            `[BackgroundJobs] [${fetchAttemptTime}] Active jobs updated with ${activeJobsList.length} jobs`
          );
          return activeJobsList;
        }

        console.debug(
          `[BackgroundJobs] [${fetchAttemptTime}] No changes in active jobs detected`
        );
        return prevActiveJobs;
      });

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
  }, [
    initialLoad,
    isFetchingRef,
    setError,
    setIsLoading,
    setLastFetchTime,
    setJobs,
    setActiveJobs,
    consecutiveErrorsRef,
    setInitialLoad,
  ]);

  // Set up polling
  useEffect(() => {
    if (!pollingEnabled) {
      console.debug(
        `[BackgroundJobs] Polling disabled, skipping polling setup`
      );
      return;
    }

    // Track consecutive poll failures for exponential backoff
    const failedPollsRef = { count: 0 };
    // Track if component is mounted to avoid state updates after unmount
    const isMountedRef = { current: true };
    // Track interval ID for cleanup
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Create a function inside the effect for polling logic
    const executePoll = async () => {
      // Skip if a fetch is already in progress
      if (isFetchingRef.current) {
        console.debug(
          `[BackgroundJobs] Skipping poll - fetch already in progress`
        );
        return;
      }

      // Exit early if component unmounted
      if (!isMountedRef.current) {
        console.debug(`[BackgroundJobs] Component unmounted, skipping poll`);
        return;
      }

      const pollStartTime = new Date().toISOString();
      console.debug(`[BackgroundJobs] [${pollStartTime}] Starting poll cycle`);

      // Set fetching flag to prevent concurrent polls
      isFetchingRef.current = true;

      try {
        // Use Tauri command
        const jobsData = await invoke<BackgroundJob[]>(
          "get_active_jobs_command"
        );

        // Record the fetch time
        const fetchTimeMs = Date.now();

        // Only update state if still mounted
        if (isMountedRef.current) {
          setLastFetchTime(fetchTimeMs);

          // Reset failed polls counter on success
          failedPollsRef.count = 0;

          console.debug(
            `[BackgroundJobs] [${pollStartTime}] Poll success: found ${jobsData.length} jobs`
          );

          // Update jobs using functional update pattern
          setJobs((prevJobs) => {
            // Only update if jobs have changed
            if (!areJobArraysEqual(prevJobs, jobsData)) {
              console.debug(
                `[BackgroundJobs] [${pollStartTime}] Updating jobs state with ${jobsData.length} jobs`
              );
              return jobsData;
            }
            return prevJobs;
          });

          // Update active jobs using functional update pattern
          setActiveJobs((prevActiveJobs) => {
            // Filter for active jobs only using the JOB_STATUSES constant
            const activeJobsList = jobsData.filter((job) =>
              JOB_STATUSES.ACTIVE.includes(job.status)
            );

            // Only update active jobs if they've changed
            if (!areJobArraysEqual(prevActiveJobs, activeJobsList)) {
              console.debug(
                `[BackgroundJobs] [${pollStartTime}] Updating active jobs with ${activeJobsList.length} jobs`
              );
              return activeJobsList;
            }
            return prevActiveJobs;
          });
        }
      } catch (err) {
        // Only update state if still mounted
        if (isMountedRef.current) {
          // Increment failure counter for exponential backoff
          failedPollsRef.count += 1;

          const backoffMultiplier = Math.min(failedPollsRef.count, 5); // Cap at 5x backoff

          console.error(
            `[BackgroundJobs] [${pollStartTime}] Error in polling fetch (failure #${failedPollsRef.count}):`,
            err
          );
          console.debug(
            `[BackgroundJobs] [${pollStartTime}] Next poll will use backoff multiplier: ${backoffMultiplier}x`
          );

          // Set error state but preserve existing jobs data
          setError(err instanceof Error ? err : new Error(String(err)));

          // If we have persistent failures, adjust polling interval temporarily
          if (failedPollsRef.count > 2 && intervalId) {
            // Clear current interval and set a new one with backoff
            clearInterval(intervalId);

            const backoffInterval = POLLING_INTERVAL * backoffMultiplier;

            console.debug(
              `[BackgroundJobs] [${pollStartTime}] Setting temporary backoff interval: ${backoffInterval}ms`
            );

            // Set a one-time timeout to try again with backoff
            setTimeout(() => {
              // After backoff, restore normal polling interval
              if (isMountedRef.current) {
                console.debug(
                  `[BackgroundJobs] [${pollStartTime}] Restoring normal polling interval after backoff`
                );

                // Only update if still mounted
                if (intervalId) clearInterval(intervalId);
                intervalId = setInterval(executePoll, POLLING_INTERVAL);

                // Execute once immediately after backoff
                void executePoll();
              }
            }, backoffInterval);
          }
        }
      } finally {
        // Reset fetching flag to allow future polls
        // This is critical to ensure polling doesn't get permanently blocked
        isFetchingRef.current = false;

        console.debug(
          `[BackgroundJobs] [${pollStartTime}] Poll cycle completed`
        );
      }
    };

    // Fetch jobs initially
    void executePoll();

    // Set up polling interval
    intervalId = setInterval(executePoll, POLLING_INTERVAL);

    console.debug(
      `[BackgroundJobs] Polling started with interval: ${POLLING_INTERVAL}ms`
    );

    // Clean up on unmount
    return () => {
      isMountedRef.current = false;
      if (intervalId) clearInterval(intervalId);

      console.debug(
        `[BackgroundJobs] Polling cleanup: intervals cleared, component marked unmounted`
      );
    };
  }, [
    pollingEnabled,
    isFetchingRef,
    setJobs,
    setActiveJobs,
    setLastFetchTime,
    setError,
  ]);

  return {
    fetchJobs,
  };
}
