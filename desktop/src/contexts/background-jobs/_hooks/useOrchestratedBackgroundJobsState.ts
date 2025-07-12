"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";

import {
  type BackgroundJob,
  JOB_STATUSES,
} from "@/types/session-types";
import { areJobArraysEqual, areJobsEqual } from "../_utils/job-state-helpers";
import { logError, getErrorMessage } from "@/utils/error-handling";
import { isTauriAvailable, safeCleanupListenerPromise } from "@/utils/tauri-utils";
import { getAllVisibleJobsAction } from "@/actions/background-jobs/jobs.actions";
import { getParsedMetadata } from "@/app/components/background-jobs-sidebar/utils";

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
  // Maintain state for jobs only - activeJobs will be derived
  const [jobs, setJobs] = useState<BackgroundJob[]>(initialJobs);

  // Track loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  // Refs for tracking state without triggering rerenders
  const isFetchingRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  
  // Derive activeJobs from jobs
  const activeJobs = useMemo(() => jobs.filter((job) => JOB_STATUSES.ACTIVE.includes(job.status)), [jobs]);

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

      // Use action to get all visible jobs
      const result = await getAllVisibleJobsAction();
      
      if (!result.isSuccess) {
        throw new Error(result.error?.message || result.error?.toString() || 'Failed to fetch jobs');
      }
      
      const response = result.data || [];

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

      // Update state if we got data back
      if (jobsData) {
        setJobs((prevJobs) => {
          if (!areJobArraysEqual(prevJobs, jobsData)) {
            return jobsData;
          }
          return prevJobs;
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
        await invoke("cancel_background_job_command", { jobId });
      } catch (err) {
        await logError(err, "Background Jobs - Cancel Job Failed", { jobId });
        
        const userMessage = getErrorMessage(err).includes("not found") 
          ? "Job not found or already completed"
          : "Failed to cancel job. Please try again.";
        
        throw new Error(userMessage);
      }
    },
    []
  );

  // Delete a job using Tauri command
  const deleteJob = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        await invoke("delete_background_job_command", { jobId });
      } catch (err) {
        await logError(err, "Background Jobs - Delete Job Failed", { jobId });
        
        const userMessage = getErrorMessage(err).includes("not found")
          ? "Job not found or already deleted"
          : "Failed to delete job. Please try again.";
        
        throw new Error(userMessage);
      }
    },
    []
  );

  // Clear job history using Tauri command
  const clearHistory = useCallback(
    async (daysToKeep: number = 0): Promise<void> => {
      try {
        await invoke("clear_job_history_command", { daysToKeep });
      } catch (err) {
        await logError(err, "Background Jobs - Clear History Failed", { daysToKeep });
        
        const userMessage = "Failed to clear job history. Please try again.";
        throw new Error(userMessage);
      }
    },
    []
  )

  // Idempotent job upsert function that handles all update cases
  const upsertJob = useCallback((jobUpdate: Partial<BackgroundJob> & { id: string }, prepend = false) => {
    // Filter out workflow orchestrator jobs
    const workflowTypes = ['file_finder_workflow', 'web_search_workflow'];
    if (jobUpdate.taskType && workflowTypes.includes(jobUpdate.taskType)) {
      return;
    }
    
    setJobs(prevJobs => {
      const existingJobIndex = prevJobs.findIndex(j => j.id === jobUpdate.id);
      
      if (existingJobIndex !== -1) {
        // Job exists - merge the update
        const existingJob = prevJobs[existingJobIndex];
        
        // Handle metadata merging for partial updates with deep merge for taskData
        let mergedMetadata = existingJob.metadata;
        if (jobUpdate.metadata !== undefined) {
          const existingMetadata = getParsedMetadata(existingJob.metadata);
          const updateMetadata = getParsedMetadata(jobUpdate.metadata);
          
          if (existingMetadata && updateMetadata) {
            // Deep merge metadata objects to preserve existing fields while updating new ones
            const merged = { ...existingMetadata, ...updateMetadata };
            
            // Deep merge taskData if both exist
            if (existingMetadata.taskData && updateMetadata.taskData) {
              merged.taskData = { ...existingMetadata.taskData, ...updateMetadata.taskData };
            }
            
            mergedMetadata = merged;
          } else if (updateMetadata) {
            mergedMetadata = updateMetadata;
          } else if (existingMetadata) {
            mergedMetadata = existingMetadata;
          }
        }
        
        const mergedJob: BackgroundJob = {
          ...existingJob,
          ...jobUpdate,
          // Preserve merged metadata
          metadata: mergedMetadata,
          // Handle response with proper null checking
          response: jobUpdate.response !== undefined 
            ? jobUpdate.response 
            : existingJob.response,
        };
        
        // Only update if job actually changed
        if (!areJobsEqual(existingJob, mergedJob)) {
          const newJobs = [...prevJobs];
          newJobs[existingJobIndex] = mergedJob;
          return newJobs;
        }
        return prevJobs;
      } else if (jobUpdate.status) {
        // Job doesn't exist and we have enough info to create it
        const newJob = jobUpdate as BackgroundJob;
        return prepend ? [newJob, ...prevJobs] : [...prevJobs, newJob];
      }
      
      return prevJobs;
    });
  }, []);
  
  // Listen for SSE events from the Rust backend
  useEffect(() => {
    let unlistenUsageUpdatePromise: Promise<() => void> | null = null;
    let unlistenResponseUpdatePromise: Promise<() => void> | null = null;
    let unlistenJobCreatedPromise: Promise<() => void> | null = null;
    let unlistenJobDeletedPromise: Promise<() => void> | null = null;
    let unlistenJobUpdatedPromise: Promise<() => void> | null = null;
    
    const setupListeners = async () => {
      try {
        // Listen for job created events
        unlistenJobCreatedPromise = listen("job_created", async (event) => {
          try {
            const newJob = event.payload as BackgroundJob;
            // Filter out workflow orchestrator jobs
            const workflowTypes = ['file_finder_workflow', 'web_search_workflow'];
            if (!workflowTypes.includes(newJob.taskType)) {
              upsertJob(newJob, true); // prepend new jobs
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job_created:", err);
          }
        });

        // Listen for job deleted events
        unlistenJobDeletedPromise = listen("job_deleted", async (event) => {
          try {
            const payload = event.payload as { jobId: string };
            setJobs((prev) => prev.filter((job) => job.id !== payload.jobId));
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job_deleted:", err);
          }
        });

        // Listen for job updated events
        unlistenJobUpdatedPromise = listen("job_updated", async (event) => {
          try {
            const jobUpdate = event.payload as Partial<BackgroundJob> & { id: string };
            // Filter out workflow orchestrator jobs
            const workflowTypes = ['file_finder_workflow', 'web_search_workflow'];
            if (!jobUpdate.taskType || !workflowTypes.includes(jobUpdate.taskType)) {
              upsertJob(jobUpdate);
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job_updated:", err);
          }
        });

        // Listen for real-time usage updates (SSE event)
        unlistenUsageUpdatePromise = listen("job_usage_update", async (event) => {
          try {
            const payload = event.payload as { 
              job_id: string;
              tokens_sent: number;      // Input tokens
              tokens_received: number;  // Output tokens
              estimated_cost: number;
              cache_write_tokens?: number;
              cache_read_tokens?: number;
            };
            
            upsertJob({
              id: payload.job_id,
              tokensSent: payload.tokens_sent,
              tokensReceived: payload.tokens_received,
              cacheWriteTokens: payload.cache_write_tokens || null,
              cacheReadTokens: payload.cache_read_tokens || null,
              actualCost: payload.estimated_cost,
              isFinalized: false, // This is estimated cost
              updatedAt: Date.now(),
            });
          } catch (err) {
            console.error("[BackgroundJobs] Error processing usage update:", err);
          }
        });

        // Listen for response update events
        unlistenResponseUpdatePromise = listen("job_response_update", async (event) => {
          try {
            const payload = event.payload as {
              job_id: string;
              response_chunk: string;
              chars_received: number;
              estimated_tokens: number;
              visual_update: boolean;
            };
            
            upsertJob({
              id: payload.job_id,
              response: (jobs.find(j => j.id === payload.job_id)?.response || '') + payload.response_chunk,
              updatedAt: Date.now(),
            });
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job_response_update:", err);
          }
        });
      } catch (err) {
        console.error("[BackgroundJobs] Error setting up job listeners:", err);
      }
    };

    void setupListeners();

    // Clean up the listeners when component unmounts
    return () => {
      if (!isTauriAvailable()) {
        // Tauri context already destroyed, skip cleanup
        return;
      }

      if (unlistenUsageUpdatePromise) {
        safeCleanupListenerPromise(unlistenUsageUpdatePromise);
      }
      if (unlistenResponseUpdatePromise) {
        safeCleanupListenerPromise(unlistenResponseUpdatePromise);
      }
      if (unlistenJobCreatedPromise) {
        safeCleanupListenerPromise(unlistenJobCreatedPromise);
      }
      if (unlistenJobDeletedPromise) {
        safeCleanupListenerPromise(unlistenJobDeletedPromise);
      }
      if (unlistenJobUpdatedPromise) {
        safeCleanupListenerPromise(unlistenJobUpdatedPromise);
      }
    };
  }, [upsertJob]);

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
    }),
    [
      // Core state
      jobs,
      activeJobs,
      isLoading,
      error,
      lastFetchTime,
      
      // Action callbacks
      cancelJob,
      deleteJob,
      clearHistory,
      refreshJobs,
      getJobById,
    ]
  );
}
