"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState, useRef, useCallback } from "react";

import {
  type BackgroundJob,
  JOB_STATUSES,
} from "@/types/session-types";
import { areJobArraysEqual } from "@/utils/job-comparison-utils";

export interface UseOrchestratedBackgroundJobsStateParams {
  initialJobs?: BackgroundJob[];
}

/**
 * Main orchestrator hook for background jobs state management
 *
 * This hook manages background jobs state by using Tauri commands.
 *
 * It maintains a single source of truth for job data, tracking:
 * - All jobs (jobs)
 * - Active/non-terminal jobs (activeJobs)
 * - Loading and error states
 * - Available actions: cancel, delete, clear, refresh
 */
export function useOrchestratedBackgroundJobsState({
  initialJobs = [],
}: UseOrchestratedBackgroundJobsStateParams = {}) {
  // Maintain state for jobs and activeJobs
  const [jobs, setJobs] = useState<BackgroundJob[]>(initialJobs);
  const [activeJobs, setActiveJobs] = useState<BackgroundJob[]>(
    initialJobs.filter((job) =>
      JOB_STATUSES.ACTIVE.includes(job.status as any)
    )
  );

  // Track loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  // Refs for tracking state without triggering rerenders
  const isFetchingRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);

  // Fetch jobs using Tauri command
  const fetchJobs = useCallback(async () => {
    // Prevent multiple concurrent fetches
    if (isFetchingRef.current) {
      return null;
    }

    // Set the fetching flag
    isFetchingRef.current = true;

    try {
      // Clear previous error state
      setError(null);

      // Show loading state on initial load only
      if (initialLoad) {
        setIsLoading(true);
      }

      // Use Tauri command
      const response = await invoke<BackgroundJob[]>("get_active_jobs_command");

      // Record fetch time
      setLastFetchTime(Date.now());

      // Reset consecutive errors on success
      consecutiveErrorsRef.current = 0;

      return response;
    } catch (err) {
      // Increment consecutive errors counter
      consecutiveErrorsRef.current += 1;

      // Log the error
      console.error(
        `[BackgroundJobs] Error fetching jobs (attempt #${consecutiveErrorsRef.current}):`,
        err
      );

      // Update error state
      setError(err instanceof Error ? err : new Error(String(err)));

      return null;
    } finally {
      // Reset the fetching flag
      isFetchingRef.current = false;

      // Update loading state if this was initial load
      if (initialLoad) {
        setIsLoading(false);
        setInitialLoad(false);
      }
    }
  }, [initialLoad]);

  // Refresh jobs and update state
  const refreshJobs = useCallback(async () => {
    // Skip if already fetching
    if (isFetchingRef.current) {
      return;
    }

    setIsLoading(true);

    try {
      const jobsData = await fetchJobs();

      // Update state if we got data back
      if (jobsData) {
        // Update jobs
        setJobs((prevJobs) => {
          if (!areJobArraysEqual(prevJobs, jobsData)) {
            return jobsData;
          }
          return prevJobs;
        });

        // Update active jobs
        setActiveJobs((prevActiveJobs) => {
          const activeJobsList = jobsData.filter((job: BackgroundJob) =>
            JOB_STATUSES.ACTIVE.includes(job.status as any)
          );

          if (!areJobArraysEqual(prevActiveJobs, activeJobsList)) {
            return activeJobsList;
          }
          return prevActiveJobs;
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchJobs]);

  // Cancel a job using Tauri command
  const cancelJob = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        // Use Tauri command
        await invoke("cancel_background_job_command", { jobId });

        // Update local state optimistically
        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  status: "canceled",
                  errorMessage: "Canceled by user",
                  endTime: job.endTime || Date.now(),
                  updatedAt: Date.now(),
                }
              : job
          )
        );

        // Remove from active jobs
        setActiveJobs((prev) => prev.filter((job) => job.id !== jobId));

        // Refresh jobs to get updated state
        await refreshJobs();
      } catch (err) {
        console.error("[BackgroundJobs] Error canceling job:", err);

        // Refresh to get current state after error
        await refreshJobs();
        throw err;
      }
    },
    [refreshJobs]
  );

  // Delete a job using Tauri command
  const deleteJob = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        // Use Tauri command
        await invoke("delete_background_job_command", { jobId });

        // Update local state
        setJobs((prev) => prev.filter((job) => job.id !== jobId));
        setActiveJobs((prev) => prev.filter((job) => job.id !== jobId));

        // Refresh jobs to get updated state
        await refreshJobs();
      } catch (err) {
        console.error("[BackgroundJobs] Error deleting job:", err);

        // Refresh to get current state after error
        await refreshJobs();
        throw err;
      }
    },
    [refreshJobs]
  );

  // Clear job history using Tauri command
  const clearHistory = useCallback(
    async (daysToKeep: number = 0): Promise<void> => {
      try {
        // Use Tauri command
        await invoke("clear_job_history_command", { daysToKeep });

        // Refresh jobs to get updated state
        await refreshJobs();
      } catch (err) {
        console.error("[BackgroundJobs] Error clearing job history:", err);

        // Refresh to get current state after error
        await refreshJobs();
        throw err;
      }
    },
    [refreshJobs]
  );

  // Listen for job status change events from the Rust backend
  useEffect(() => {
    const unlisten = listen("job_status_change", async (event) => {
      try {
        // The payload should include the job ID and potentially other metadata
        const payload = event.payload as { job_id?: string; jobId?: string };
        const jobId = payload.jobId || payload.job_id;

        if (!jobId) {
          console.error(
            "[BackgroundJobs] Received job_status_change event without jobId",
            event.payload
          );
          return;
        }


        // Fetch the updated job details using Tauri command
        try {
          const updatedJob = await invoke<BackgroundJob>(
            "get_background_job_by_id_command",
            { jobId }
          );

          if (!updatedJob) {
            throw new Error("Failed to get job details");
          }

          // Update the jobs state
          setJobs((prev) => {
            // Find and replace the job in the array
            const updatedJobs = prev.map((job) =>
              job.id === updatedJob.id ? updatedJob : job
            );

            // If the job doesn't exist in our current state, add it
            if (!prev.some((job) => job.id === updatedJob.id)) {
              updatedJobs.push(updatedJob);
            }

            return updatedJobs;
          });

          // Update active jobs state
          setActiveJobs((prev) => {
            const isJobActive = JOB_STATUSES.ACTIVE.includes(
              updatedJob.status as any
            );
            const jobExistsInActive = prev.some(
              (job) => job.id === updatedJob.id
            );

            // If job should be active but isn't in the active list, add it
            if (isJobActive && !jobExistsInActive) {
              return [...prev, updatedJob];
            }

            // If job shouldn't be active but is in the active list, remove it
            if (!isJobActive && jobExistsInActive) {
              return prev.filter((job) => job.id !== updatedJob.id);
            }

            // If job should be active and is already in the list, update it
            if (isJobActive && jobExistsInActive) {
              return prev.map((job) =>
                job.id === updatedJob.id ? updatedJob : job
              );
            }

            // Otherwise, no change to active jobs
            return prev;
          });
        } catch (err) {
          console.error(
            `[BackgroundJobs] Error fetching updated job ${jobId}:`,
            err
          );
        }
      } catch (err) {
        console.error(
          "[BackgroundJobs] Error processing job_status_change event:",
          err
        );
      }
    });

    // Clean up the listener when component unmounts
    return () => {
      void unlisten.then((cleanupFn) => cleanupFn());
    };
  }, []);

  // Initial job fetch on mount
  useEffect(() => {
    // Skip if already fetching or if we have initial jobs
    if (isFetchingRef.current || (initialJobs.length > 0 && initialLoad)) {
      return;
    }

    void refreshJobs();
  }, [initialJobs.length, initialLoad, refreshJobs]);

  // Get job by ID helper
  const getJobById = useCallback(
    (jobId: string) => jobs.find((job) => job.id === jobId),
    [jobs]
  );

  return {
    // State
    jobs,
    activeJobs,
    isLoading,
    error,

    // Actions
    cancelJob,
    deleteJob,
    clearHistory,
    refreshJobs,
    getJobById,

    // For debugging/testing
    isFetchingRef,
    consecutiveErrorsRef,
    lastFetchTime,
  };
}
