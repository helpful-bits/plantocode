"use client";

import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";

import {
  type BackgroundJob,
  JOB_STATUSES,
} from "@/types/session-types";
import { areJobArraysEqual, areJobsEqual } from "../_utils/job-state-helpers";
import { logError, getErrorMessage } from "@/utils/error-handling";
import { safeListen } from "@/utils/tauri-event-utils";
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
  
  // Refs for debouncing job updates during streaming
  const bufferRef = useRef<Map<string, any>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
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

  // Parse metadata without caching to ensure cost updates are always reflected
  const parseMetadata = useCallback((metadata: any) => {
    if (!metadata) return null;
    return getParsedMetadata(metadata);
  }, []);
  
  const upsertJobInternal = useCallback((prevJobs: BackgroundJob[], jobUpdate: Partial<BackgroundJob> & { id: string }, prepend = false) => {
    // Special handling for finalized jobs - always replace with authoritative data
    if (jobUpdate.isFinalized) {
      console.debug(`[BackgroundJobs] Finalizing job ${jobUpdate.id} with authoritative data`);
      
      const newJobs = prevJobs.filter(j => j.id !== jobUpdate.id);
      // Cast jobUpdate as full BackgroundJob since finalized updates contain all data
      newJobs.push(jobUpdate as BackgroundJob);
      return newJobs;
    }
    
    // Filter out workflow orchestrator jobs
    const workflowTypes = ['file_finder_workflow', 'web_search_workflow'];
    if (jobUpdate.taskType && workflowTypes.includes(jobUpdate.taskType)) {
      return prevJobs;
    }
    
    const existingJobIndex = prevJobs.findIndex(j => j.id === jobUpdate.id);
    
    if (existingJobIndex !== -1) {
      // Job exists - merge the update
      const existingJob = prevJobs[existingJobIndex];
      
      // Handle metadata merging - prioritize finalized cost data
      let mergedMetadata = existingJob.metadata;
      if (jobUpdate.metadata !== undefined) {
        const existingMetadata = parseMetadata(existingJob.metadata);
        const updateMetadata = parseMetadata(jobUpdate.metadata);
        
        // For finalized updates, prioritize the update data completely
        if (jobUpdate.isFinalized) {
          mergedMetadata = updateMetadata || jobUpdate.metadata;
        } else if (existingMetadata && updateMetadata) {
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
      
      // For finalized cost updates, always update regardless of comparison
      if (jobUpdate.isFinalized) {
        console.debug(`[BackgroundJobs] Finalizing job ${jobUpdate.id} - updating with authoritative data`);
        const newJobs = [...prevJobs];
        newJobs[existingJobIndex] = mergedJob;
        return newJobs;
      }
      
      // Always update when job transitions to completed status OR when updating a completed job
      // This ensures the final response from the database overwrites any partial streamed response
      if (mergedJob.status === 'completed') {
        const newJobs = [...prevJobs];
        newJobs[existingJobIndex] = mergedJob;
        return newJobs;
      }
      
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
  }, [parseMetadata]);
  
  const upsertJob = useCallback((jobUpdate: Partial<BackgroundJob> & { id: string }, prepend = false) => {
    setJobs(prevJobs => upsertJobInternal(prevJobs, jobUpdate, prepend));
  }, [upsertJobInternal]);
  
  // Batch update multiple jobs in a single reducer pass
  const bulkUpsertJobs = useCallback((
    jobUpdates: Array<Partial<BackgroundJob> & { id: string }>
  ) => {
    setJobs(prev => jobUpdates.reduce((acc, u) => upsertJobInternal(acc, u), prev));
  }, [upsertJobInternal]);
  
  // Listen for SSE events from the Rust backend
  useEffect(() => {
    let unlistenJobCreated: UnlistenFn | null = null;
    let unlistenJobDeleted: UnlistenFn | null = null;
    let unlistenJobUpdated: UnlistenFn | null = null;
    
    // Setup flush interval for buffered updates
    const flushBufferedUpdates = () => {
      if (bufferRef.current.size > 0) {
        // Collect all buffered updates
        const updates = Array.from(bufferRef.current.values());
        bufferRef.current.clear();
        
        // Apply all updates in a single batch
        if (updates.length > 0) {
          bulkUpsertJobs(updates);
        }
      }
    };
    
    // Start flush interval at 250ms
    flushTimerRef.current = setInterval(flushBufferedUpdates, 250);
    
    const setupListeners = async () => {
      try {
        // Listen for job created events
        unlistenJobCreated = await safeListen("job_created", async (event) => {
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
        unlistenJobDeleted = await safeListen("job_deleted", async (event) => {
          try {
            const payload = event.payload as { jobId: string };
            setJobs((prev) => prev.filter((job) => job.id !== payload.jobId));
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job_deleted:", err);
          }
        });

        // Listen for job updated events
        unlistenJobUpdated = await safeListen("job_updated", async (event) => {
          try {
            const jobUpdate = event.payload as Partial<BackgroundJob> & { id: string };
            // Filter out workflow orchestrator jobs
            const workflowTypes = ['file_finder_workflow', 'web_search_workflow'];
            if (!jobUpdate.taskType || !workflowTypes.includes(jobUpdate.taskType)) {
              // Check if this is a finalized cost update or a completed/failed/cancelled job
              const isFinalized = jobUpdate.isFinalized === true;
              const isTerminal = jobUpdate.status && ['completed', 'failed', 'cancelled'].includes(jobUpdate.status);
              
              if (isFinalized || isTerminal) {
                // Apply immediately for finalized or terminal updates (bypass buffer)
                const immediateUpdate = {
                  ...jobUpdate,
                  isFinalized: isFinalized || undefined,
                  updatedAt: Date.now(),
                };
                upsertJob(immediateUpdate);
                
                // Remove from buffer if present
                bufferRef.current.delete(jobUpdate.id);
                
                // Log important updates for debugging
                if (isFinalized) {
                  console.debug(`[BackgroundJobs] Job ${jobUpdate.id} finalized with authoritative cost data`);
                } else if (jobUpdate.status === 'completed') {
                  console.debug(`[BackgroundJobs] Job ${jobUpdate.id} completed - updating with final data`);
                }
              } else {
                // Buffer non-terminal updates for batching
                bufferRef.current.set(jobUpdate.id, {
                  ...jobUpdate,
                  updatedAt: Date.now(),
                });
              }
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job_updated:", err);
          }
        });

      } catch (err) {
        console.error("[BackgroundJobs] Error setting up job listeners:", err);
      }
    };

    void setupListeners();

    // Clean up the listeners and intervals when component unmounts
    return () => {
      unlistenJobCreated?.();
      unlistenJobDeleted?.();
      unlistenJobUpdated?.();
      
      // Clear flush interval and process any remaining buffered updates
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushBufferedUpdates();
      bufferRef.current.clear();
    };
  }, [upsertJob, bulkUpsertJobs]);

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
