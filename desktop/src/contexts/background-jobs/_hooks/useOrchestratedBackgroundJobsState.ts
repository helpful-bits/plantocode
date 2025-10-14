"use client";

import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";

import { useNotification } from "@/contexts/notification-context";
import { useUILayout } from "@/contexts/ui-layout-context";

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
  sessionId?: string;
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
  sessionId,
}: UseOrchestratedBackgroundJobsStateParams = {}) {
  const { showNotification } = useNotification();
  const { isUserPresent, lastPresenceChangeTs } = useUILayout();

  const presenceRef = useRef(isUserPresent);
  const prevPresenceRef = useRef(isUserPresent);

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
  const notifiedJobsRef = useRef(new Map<string, number>());

  // Track which implementation plan job is currently open in a modal for optimized streaming
  const viewedImplementationPlanIdRef = useRef<string | null>(null);
  
  // Initialize Map with initial jobs
  useEffect(() => {
    if (initialJobs.length > 0) {
      jobsMapRef.current.clear();
      initialJobs.forEach(job => {
        jobsMapRef.current.set(job.id, job);
      });
    }
  }, [initialJobs]);
  
  useEffect(() => {
    presenceRef.current = isUserPresent;
  }, [isUserPresent]);

  // Derive activeJobs from jobs
  const activeJobs = useMemo(() => jobs.filter((job) => JOB_STATUSES.ACTIVE.includes(job.status)), [jobs]);

  // Helper function to update Map and derive new array
  const updateJobsFromMap = useCallback(() => {
    if (!presenceRef.current) return;
    const newJobsArray = Array.from(jobsMapRef.current.values());
    setJobs(newJobsArray);
  }, []);

  // Server-side filtering architecture:
  // The Rust backend (desktop/src-tauri/src/remote_api/handlers/jobs.rs) now handles:
  // 1. Session-based scoping via SessionRepository resolution
  // 2. Workflow job type exclusion (file_finder_workflow, web_search_workflow)
  //
  // This ensures all clients (desktop, mobile) receive pre-filtered, session-scoped data
  // from the initial fetch, eliminating client-side filtering complexity and preventing
  // UI flicker from over-fetching followed by client-side reduction.
  //
  // Client-side filtering in this hook is now minimal and handles only:
  // - UI-level search queries
  // - Status filtering for display purposes

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

      if (initialLoad && presenceRef.current) {
        setIsLoading(true);
      }

      // Use action to get all visible jobs for the current project and session
      const result = await getAllVisibleJobsAction(projectDirectory, sessionId);

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
      isFetchingRef.current = false;

      if (initialLoad) {
        if (presenceRef.current) {
          setIsLoading(false);
        }
        setInitialLoad(false);
      }
    }
  }, [initialLoad, projectDirectory, sessionId]);

  const refreshJobs = useCallback(async () => {
    if (isFetchingRef.current) {
      return;
    }

    if (presenceRef.current) {
      setIsLoading(true);
    }

    try {
      const jobsData = await fetchJobs();

      if (jobsData) {
        jobsMapRef.current.clear();
        jobsData.forEach(job => {
          jobsMapRef.current.set(job.id, job);
        });
        if (presenceRef.current) {
          updateJobsFromMap();
        }
      }
    } finally {
      if (presenceRef.current) {
        setIsLoading(false);
      }
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
    let unlistenJobMetadataUpdated: UnlistenFn | null = null;
    
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

              // Check if user input is required
              const payload = event.payload as any;
              const needsInput =
                (payload.subStatusMessage && /user\s*input|await(ing)?\s*input|requires\s*your\s*input/i.test(payload.subStatusMessage)) ||
                (payload.metadata?.taskData?.userInputRequired === true);

              if (needsInput) {
                const lastNotified = notifiedJobsRef.current.get(update.jobId) || 0;
                const now = Date.now();

                // Only notify if not notified in last 30 seconds
                if (now - lastNotified > 30000) {
                  const inputHint = payload.metadata?.taskData?.userInputHint;
                  showNotification({
                    title: "Action needed",
                    message: inputHint || "This job requires your input.",
                    type: "warning"
                  });
                  notifiedJobsRef.current.set(update.jobId, now);
                }
              }
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

        unlistenJobMetadataUpdated = await safeListen("job:metadata-updated", async (event) => {
          try {
            const update = event.payload as { jobId: string; metadataPatch: any };
            const existingJob = jobsMapRef.current.get(update.jobId);
            if (existingJob) {
              let metadata: any = existingJob.metadata;
              if (typeof metadata === 'string') {
                try {
                  metadata = JSON.parse(metadata);
                } catch {
                  metadata = {};
                }
              }
              metadata = metadata || {};

              for (const [key, value] of Object.entries(update.metadataPatch)) {
                if (value && typeof value === 'object' && !Array.isArray(value) && metadata[key] && typeof metadata[key] === 'object') {
                  metadata[key] = { ...metadata[key], ...value };
                } else {
                  metadata[key] = value;
                }
              }

              const updatedJob: BackgroundJob = {
                ...existingJob,
                metadata,
                updatedAt: Date.now(),
              };
              jobsMapRef.current.set(update.jobId, updatedJob);
              updateJobsFromMap();
            }
          } catch (err) {
            console.error("[BackgroundJobs] Error processing job:metadata-updated:", err);
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
      unlistenJobMetadataUpdated?.();
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

  // Refetch jobs when sessionId changes
  useEffect(() => {
    if (sessionId && !initialLoad) {
      void refreshJobs();
    }
  }, [sessionId, initialLoad, refreshJobs]);

  useEffect(() => {
    if (isUserPresent && !prevPresenceRef.current) {
      void refreshJobs();
    }
    prevPresenceRef.current = isUserPresent;
  }, [lastPresenceChangeTs, isUserPresent, refreshJobs]);

  // Get job by ID helper
  const getJobById = useCallback(
    (jobId: string) => jobsMapRef.current.get(jobId) || undefined,
    []
  );

  // Set which implementation plan is currently being viewed in a modal
  const setViewedImplementationPlanId = useCallback(async (jobId: string | null) => {
    // Simply set the viewed ID - no fetch needed as list already has full content
    viewedImplementationPlanIdRef.current = jobId;
  }, []);

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
      setViewedImplementationPlanId,

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
      setViewedImplementationPlanId,
    ]
  );
}