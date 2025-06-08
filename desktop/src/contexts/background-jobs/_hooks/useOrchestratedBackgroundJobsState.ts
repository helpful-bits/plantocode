"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";

import {
  type BackgroundJob,
  JOB_STATUSES,
} from "@/types/session-types";
import { areJobArraysEqual, areJobsEqual } from "@/utils/job-comparison-utils";
import { logError, getErrorMessage } from "@/utils/error-handling";

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
      JOB_STATUSES.ACTIVE.includes(job.status)
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
  
  // State for triggering timestamp updates
  const [timestampUpdateTrigger, setTimestampUpdateTrigger] = useState(0);

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

      // Log the error with context
      await logError(err, "Background Jobs - Fetch Jobs Failed", {
        consecutiveErrors: consecutiveErrorsRef.current,
        lastFetchTime,
        initialLoad
      });

      // Create user-friendly error message
      const errorMessage = getErrorMessage(err);
      let userFriendlyMessage = "Failed to fetch background jobs";
      
      if (errorMessage.includes("network") || errorMessage.includes("connection")) {
        userFriendlyMessage = "Network error loading jobs. Retrying automatically...";
      } else if (errorMessage.includes("timeout")) {
        userFriendlyMessage = "Request timed out loading jobs. Will retry shortly.";
      } else if (consecutiveErrorsRef.current > 3) {
        userFriendlyMessage = "Persistent error loading jobs. Please check your connection.";
      }

      // Update error state with user-friendly message
      setError(new Error(userFriendlyMessage));

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

      // Update state if we got data back - batch updates for better performance
      if (jobsData) {
        // Calculate active jobs once
        const activeJobsList = jobsData.filter((job: BackgroundJob) =>
          JOB_STATUSES.ACTIVE.includes(job.status)
        );
        
        // Ensure jobs and activeJobs are correctly updated atomically
        setJobs((prevJobs) => {
          if (!areJobArraysEqual(prevJobs, jobsData)) {
            return jobsData;
          }
          return prevJobs;
        });

        // Update active jobs separately but consistently
        setActiveJobs((prevActiveJobs) => {
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
                  status: "canceled" as const,
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
        await logError(err, "Background Jobs - Cancel Job Failed", { jobId });
        
        // Refresh to get current state after error
        await refreshJobs();
        
        // Create user-friendly error message
        const userMessage = getErrorMessage(err).includes("not found") 
          ? "Job not found or already completed"
          : "Failed to cancel job. Please try again.";
        
        throw new Error(userMessage);
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
        await logError(err, "Background Jobs - Delete Job Failed", { jobId });
        
        // Refresh to get current state after error
        await refreshJobs();
        
        // Create user-friendly error message
        const userMessage = getErrorMessage(err).includes("not found")
          ? "Job not found or already deleted"
          : "Failed to delete job. Please try again.";
        
        throw new Error(userMessage);
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
        await logError(err, "Background Jobs - Clear History Failed", { daysToKeep });
        
        // Refresh to get current state after error
        await refreshJobs();
        
        // Create user-friendly error message
        const userMessage = "Failed to clear job history. Please try again.";
        throw new Error(userMessage);
      }
    },
    [refreshJobs]
  );

  // Optimized job update function to reduce state setter calls
  const updateJobInState = useCallback((updatedJob: BackgroundJob) => {
    // Batch both state updates in a single effect
    setJobs(prevJobs => {
      const existingJobIndex = prevJobs.findIndex(j => j.id === updatedJob.id);
      let newJobs = prevJobs;
      
      if (existingJobIndex !== -1) {
        if (!areJobsEqual(prevJobs[existingJobIndex], updatedJob)) {
          newJobs = [...prevJobs];
          newJobs[existingJobIndex] = updatedJob;
        }
      } else {
        newJobs = [...prevJobs, updatedJob];
      }
      
      // Update active jobs in the same cycle
      setActiveJobs(prevActiveJobs => {
        const isJobActive = JOB_STATUSES.ACTIVE.includes(updatedJob.status);
        const existingActiveIndex = prevActiveJobs.findIndex((job) => job.id === updatedJob.id);
        const jobExistsInActive = existingActiveIndex !== -1;

        if (isJobActive && !jobExistsInActive) {
          return [...prevActiveJobs, updatedJob];
        }

        if (!isJobActive && jobExistsInActive) {
          return prevActiveJobs.filter((job) => job.id !== updatedJob.id);
        }

        if (isJobActive && jobExistsInActive) {
          if (areJobsEqual(prevActiveJobs[existingActiveIndex], updatedJob)) return prevActiveJobs;
          const newActiveJobs = [...prevActiveJobs];
          newActiveJobs[existingActiveIndex] = updatedJob;
          return newActiveJobs;
        }

        return prevActiveJobs;
      });
      
      return newJobs;
    });
  }, []);
  
  // Listen for job status change events from the Rust backend
  useEffect(() => {
    let unlistenStatusPromise: Promise<() => void> | null = null;
    let unlistenResponseUpdatePromise: Promise<() => void> | null = null;
    
    const setupListeners = async () => {
      try {
        // Listen for job status changes
        unlistenStatusPromise = listen("job_status_change", async (event) => {
          try {
            // The payload should include the job ID and potentially other metadata
            const payload = event.payload as { jobId: string; status: string; message?: string };
            const jobId = payload.jobId;

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
                console.warn(`[BackgroundJobs] Job ${jobId} not found, may have been deleted`);
                // Remove from local state if it doesn't exist
                setJobs(prev => prev.filter(j => j.id !== jobId));
                setActiveJobs(prev => prev.filter(j => j.id !== jobId));
                return;
              }

              // Use optimized update function
              updateJobInState(updatedJob);

              // Special handling for workflow jobs: If this job belongs to a workflow,
              // the workflow state managed by useWorkflowTracker should be refreshed
              // However, we rely on useWorkflowTracker's polling mechanism for workflow updates
              // since it has more complete workflow context. The individual job updates here
              // are sufficient for non-workflow-specific job display needs.
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

        // Listen for streaming response updates
        unlistenResponseUpdatePromise = listen("VIBE_MANAGER_JOB_RESPONSE_UPDATE_EVENT", async (event) => {
          try {
            const payload = event.payload as { 
              job_id: string; 
              response_chunk: string; 
              tokens_received: number; 
              metadata: string; 
            };
            
            if (!payload.job_id) {
              console.error(
                "[BackgroundJobs] Received VIBE_MANAGER_JOB_RESPONSE_UPDATE_EVENT without job_id",
                event.payload
              );
              return;
            }

            // Update the job in state with new response chunk
            setJobs(prevJobs => {
              const jobIndex = prevJobs.findIndex(j => j.id === payload.job_id);
              if (jobIndex === -1) {
                // Job not found in current state, ignore
                return prevJobs;
              }

              const existingJob = prevJobs[jobIndex];
              const currentResponse = existingJob.response || "";
              const updatedResponse = currentResponse + payload.response_chunk;

              const updatedJob: BackgroundJob = {
                ...existingJob,
                response: updatedResponse,
                tokensReceived: payload.tokens_received,
                updatedAt: Date.now(),
                metadata: payload.metadata,
              };

              // Check if this is actually a change to avoid unnecessary re-renders
              if (areJobsEqual(existingJob, updatedJob)) {
                return prevJobs;
              }

              const newJobs = [...prevJobs];
              newJobs[jobIndex] = updatedJob;

              // Also update active jobs if this job is active
              setActiveJobs(prevActiveJobs => {
                const activeJobIndex = prevActiveJobs.findIndex(j => j.id === payload.job_id);
                if (activeJobIndex !== -1) {
                  const newActiveJobs = [...prevActiveJobs];
                  newActiveJobs[activeJobIndex] = updatedJob;
                  return newActiveJobs;
                }
                return prevActiveJobs;
              });

              return newJobs;
            });
          } catch (err) {
            console.error(
              "[BackgroundJobs] Error processing VIBE_MANAGER_JOB_RESPONSE_UPDATE_EVENT:",
              err
            );
          }
        });
      } catch (err) {
        console.error("[BackgroundJobs] Error setting up job listeners:", err);
      }
    };

    void setupListeners();

    // Clean up the listeners when component unmounts
    return () => {
      if (unlistenStatusPromise) {
        void unlistenStatusPromise.then((cleanupFn) => cleanupFn());
      }
      if (unlistenResponseUpdatePromise) {
        void unlistenResponseUpdatePromise.then((cleanupFn) => cleanupFn());
      }
    };
  }, [updateJobInState]);

  // Initial job fetch on mount
  useEffect(() => {
    // Skip if already fetching or if we have initial jobs
    if (isFetchingRef.current || (initialJobs.length > 0 && initialLoad)) {
      return;
    }

    void refreshJobs();
  }, [initialJobs.length, initialLoad, refreshJobs]);

  // Set up timer to update timestamps every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimestampUpdateTrigger(prev => prev + 1);
    }, 60000); // Update every 60 seconds

    return () => clearInterval(interval);
  }, []);

  // Get job by ID helper
  const getJobById = useCallback(
    (jobId: string) => jobs.find((job) => job.id === jobId),
    [jobs]
  );

  return useMemo(
    () => ({
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
      timestampUpdateTrigger,
    }),
    [
      // Core state
      jobs,
      activeJobs,
      isLoading,
      error,
      lastFetchTime,
      timestampUpdateTrigger,
      
      // Action callbacks
      cancelJob,
      deleteJob,
      clearHistory,
      refreshJobs,
      getJobById,
    ]
  );
}
