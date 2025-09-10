"use client";

import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";

import {
  type BackgroundJob,
  JOB_STATUSES,
} from "@/types/session-types";
import { logError, getErrorMessage } from "@/utils/error-handling";
import { safeListen } from "@/utils/tauri-event-utils";
import { getAllVisibleJobsAction } from "@/actions/background-jobs/jobs.actions";

export interface UseOrchestratedBackgroundJobsStateParams {
  initialJobs?: BackgroundJob[];
  projectDirectory?: string;
}

/**
 * Main orchestrator hook for background jobs state management
 *
 * This hook manages background jobs state using a pure event-driven Map-based approach.
 * It maintains a single source of truth using a Map and derives React state for rendering.
 *
 * Features:
 * - Map-based job storage for O(1) lookups and updates
 * - Pure event-driven updates with surgical field modifications
 * - Single bootstrap fetch on mount, no polling
 * - Manual refresh capability for user-triggered updates
 */
export function useOrchestratedBackgroundJobsState({
  initialJobs = [],
  projectDirectory,
}: UseOrchestratedBackgroundJobsStateParams = {}) {
  // Authoritative job store using Map for O(1) operations
  const jobsMapRef = useRef(new Map<string, BackgroundJob>());
  
  // React state derived from Map for rendering
  const [jobs, setJobs] = useState<BackgroundJob[]>(initialJobs);
  
  // Track loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  // Refs for tracking state without triggering rerenders
  const isFetchingRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  
  // Initialize Map with initial jobs
  useEffect(() => {
    if (initialJobs.length > 0) {
      jobsMapRef.current.clear();
      initialJobs.forEach(job => {
        jobsMapRef.current.set(job.id, job);
      });
    }
  }, [initialJobs]);
  
  // Derive activeJobs from jobs
  const activeJobs = useMemo(() => jobs.filter((job) => JOB_STATUSES.ACTIVE.includes(job.status)), [jobs]);

  // Helper function to update Map and derive new array
  const updateJobsFromMap = useCallback(() => {
    const newJobsArray = Array.from(jobsMapRef.current.values());
    setJobs(newJobsArray);
  }, []);

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

      // Use action to get all visible jobs for the current project
      const result = await getAllVisibleJobsAction(projectDirectory);
      
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
  }, [initialLoad, projectDirectory]);

  // Manual refresh function - fetches all jobs and replaces Map contents
  const refreshJobs = useCallback(async () => {
    // Skip if already fetching
    if (isFetchingRef.current) {
      return;
    }

    setIsLoading(true);

    try {
      const jobsData = await fetchJobs();

      // Update Map and derive new state if we got data back
      if (jobsData) {
        jobsMapRef.current.clear();
        jobsData.forEach(job => {
          jobsMapRef.current.set(job.id, job);
        });
        updateJobsFromMap();
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchJobs, updateJobsFromMap]);

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
  );

  // Listen for event-driven updates from the Rust backend
  useEffect(() => {
    let unlistenJobCreated: UnlistenFn | null = null;
    let unlistenJobDeleted: UnlistenFn | null = null;
    let unlistenJobStatusChanged: UnlistenFn | null = null;
    let unlistenJobStreamProgress: UnlistenFn | null = null;
    let unlistenJobTokensUpdated: UnlistenFn | null = null;
    let unlistenJobCostUpdated: UnlistenFn | null = null;
    let unlistenJobResponseAppended: UnlistenFn | null = null;
    let unlistenJobErrorDetails: UnlistenFn | null = null;
    let unlistenJobFinalized: UnlistenFn | null = null;
    
    const setupListeners = async () => {
      try {
        // Listen for job created events - Insert into Map
        unlistenJobCreated = await safeListen("job:created", async (event) => {
          try {
            const payload = event.payload as { job: BackgroundJob };
            const newJob = payload.job;
            // Filter out workflow orchestrator jobs
            const workflowTypes = ['file_finder_workflow', 'web_search_workflow'];
            if (!workflowTypes.includes(newJob.taskType)) {
              jobsMapRef.current.set(newJob.id, newJob);
              updateJobsFromMap();
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job:created:", err);
          }
        });

        // Listen for job deleted events - Delete from Map
        unlistenJobDeleted = await safeListen("job:deleted", async (event) => {
          try {
            const payload = event.payload as { jobId: string };
            if (jobsMapRef.current.has(payload.jobId)) {
              jobsMapRef.current.delete(payload.jobId);
              updateJobsFromMap();
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job:deleted:", err);
          }
        });

        // Listen for job status changed events - Patch status/timestamps/subStatusMessage
        unlistenJobStatusChanged = await safeListen("job:status-changed", async (event) => {
          try {
            const update = event.payload as { jobId: string; status: string; startTime?: number; endTime?: number; subStatusMessage?: string };
            const existingJob = jobsMapRef.current.get(update.jobId);
            if (existingJob) {
              const updatedJob: BackgroundJob = {
                ...existingJob,
                status: update.status as any,
                startTime: update.startTime ?? existingJob.startTime,
                endTime: update.endTime ?? existingJob.endTime,
                subStatusMessage: update.subStatusMessage ?? existingJob.subStatusMessage,
                updatedAt: Date.now(),
              };
              jobsMapRef.current.set(update.jobId, updatedJob);
              updateJobsFromMap();
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job:status-changed:", err);
          }
        });

        // Listen for job stream progress events - Update progress and metadata.taskData fields
        unlistenJobStreamProgress = await safeListen("job:stream-progress", async (event) => {
          try {
            const update = event.payload as { 
              jobId: string; 
              progress?: number; 
              responseLength?: number; 
              estimatedTotalLength?: number;
              lastStreamUpdateTime?: number;
              isStreaming?: boolean;
            };
            const existingJob = jobsMapRef.current.get(update.jobId);
            if (existingJob) {
              // Parse existing metadata
              let metadata: any = existingJob.metadata;
              if (typeof metadata === 'string') {
                try {
                  metadata = JSON.parse(metadata);
                } catch {
                  metadata = {};
                }
              }
              metadata = metadata || {};
              
              // Update taskData fields
              const taskData = metadata.taskData || {};
              if (update.progress !== undefined) taskData.streamProgress = update.progress;
              if (update.responseLength !== undefined) taskData.responseLength = update.responseLength;
              if (update.estimatedTotalLength !== undefined) taskData.estimatedTotalLength = update.estimatedTotalLength;
              if (update.lastStreamUpdateTime !== undefined) taskData.lastStreamUpdateTime = update.lastStreamUpdateTime;
              if (update.isStreaming !== undefined) taskData.isStreaming = update.isStreaming;
              
              metadata.taskData = taskData;
              
              const updatedJob: BackgroundJob = {
                ...existingJob,
                metadata,
                updatedAt: Date.now(),
              };
              jobsMapRef.current.set(update.jobId, updatedJob);
              updateJobsFromMap();
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job:stream-progress:", err);
          }
        });

        // Listen for job tokens updated events - Patch token fields
        unlistenJobTokensUpdated = await safeListen("job:tokens-updated", async (event) => {
          try {
            const update = event.payload as { 
              jobId: string; 
              tokensSent?: number; 
              tokensReceived?: number;
              cacheWriteTokens?: number;
              cacheReadTokens?: number;
            };
            const existingJob = jobsMapRef.current.get(update.jobId);
            if (existingJob) {
              const updatedJob: BackgroundJob = {
                ...existingJob,
                tokensSent: update.tokensSent ?? existingJob.tokensSent,
                tokensReceived: update.tokensReceived ?? existingJob.tokensReceived,
                cacheWriteTokens: update.cacheWriteTokens ?? existingJob.cacheWriteTokens,
                cacheReadTokens: update.cacheReadTokens ?? existingJob.cacheReadTokens,
                updatedAt: Date.now(),
              };
              jobsMapRef.current.set(update.jobId, updatedJob);
              updateJobsFromMap();
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job:tokens-updated:", err);
          }
        });

        // Listen for job cost updated events - Patch actualCost and isFinalized flag
        unlistenJobCostUpdated = await safeListen("job:cost-updated", async (event) => {
          try {
            const update = event.payload as { jobId: string; actualCost?: number; isFinalized?: boolean };
            const existingJob = jobsMapRef.current.get(update.jobId);
            if (existingJob) {
              const updatedJob: BackgroundJob = {
                ...existingJob,
                actualCost: update.actualCost ?? existingJob.actualCost,
                isFinalized: update.isFinalized ?? existingJob.isFinalized,
                updatedAt: Date.now(),
              };
              jobsMapRef.current.set(update.jobId, updatedJob);
              updateJobsFromMap();
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job:cost-updated:", err);
          }
        });

        // Listen for job response appended events - Append chunk to response field
        unlistenJobResponseAppended = await safeListen("job:response-appended", async (event) => {
          try {
            const update = event.payload as { jobId: string; chunk: string; accumulatedLength: number };
            const existingJob = jobsMapRef.current.get(update.jobId);
            if (existingJob) {
              const currentResponse = existingJob.response || '';
              const updatedJob: BackgroundJob = {
                ...existingJob,
                response: currentResponse + update.chunk,
                updatedAt: Date.now(),
              };
              jobsMapRef.current.set(update.jobId, updatedJob);
              updateJobsFromMap();
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job:response-appended:", err);
          }
        });

        // Listen for job error details events - Set errorDetails
        unlistenJobErrorDetails = await safeListen("job:error-details", async (event) => {
          try {
            const update = event.payload as { jobId: string; errorDetails: any };
            const existingJob = jobsMapRef.current.get(update.jobId);
            if (existingJob) {
              const updatedJob: BackgroundJob = {
                ...existingJob,
                errorMessage: update.errorDetails,
                updatedAt: Date.now(),
              };
              jobsMapRef.current.set(update.jobId, updatedJob);
              updateJobsFromMap();
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job:error-details:", err);
          }
        });

        // Listen for job finalized events - Set final status/cost/tokens snapshot
        unlistenJobFinalized = await safeListen("job:finalized", async (event) => {
          try {
            const update = event.payload as { 
              jobId: string; 
              status: string; 
              response?: string;
              actualCost: number;
              tokensSent?: number;
              tokensReceived?: number;
              cacheReadTokens?: number;
              cacheWriteTokens?: number;
            };
            const existingJob = jobsMapRef.current.get(update.jobId);
            if (existingJob) {
              const updatedJob: BackgroundJob = {
                ...existingJob,
                status: update.status as any,
                response: update.response ?? existingJob.response,
                actualCost: update.actualCost,
                tokensSent: update.tokensSent ?? existingJob.tokensSent,
                tokensReceived: update.tokensReceived ?? existingJob.tokensReceived,
                cacheReadTokens: update.cacheReadTokens ?? existingJob.cacheReadTokens,
                cacheWriteTokens: update.cacheWriteTokens ?? existingJob.cacheWriteTokens,
                isFinalized: true,
                updatedAt: Date.now(),
              };
              jobsMapRef.current.set(update.jobId, updatedJob);
              updateJobsFromMap();
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job:finalized:", err);
          }
        });

      } catch (err) {
        console.error("[BackgroundJobs] Error setting up job listeners:", err);
      }
    };

    void setupListeners();

    // Clean up the listeners when component unmounts
    return () => {
      unlistenJobCreated?.();
      unlistenJobDeleted?.();
      unlistenJobStatusChanged?.();
      unlistenJobStreamProgress?.();
      unlistenJobTokensUpdated?.();
      unlistenJobCostUpdated?.();
      unlistenJobResponseAppended?.();
      unlistenJobErrorDetails?.();
      unlistenJobFinalized?.();
    };
  }, [updateJobsFromMap]);

  // Initial job fetch on mount - single bootstrap call, no polling
  useEffect(() => {
    // Skip if already fetching or if we have initial jobs
    if (isFetchingRef.current || (initialJobs.length > 0 && initialLoad)) {
      return;
    }

    void refreshJobs();
  }, [initialJobs.length, initialLoad, refreshJobs]);

  // Get job by ID helper
  const getJobById = useCallback(
    (jobId: string) => jobsMapRef.current.get(jobId) || undefined,
    []
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