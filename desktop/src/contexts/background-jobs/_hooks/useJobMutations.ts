"use client";

import { useCallback } from "react";

import {
  cancelBackgroundJobAction,
  deleteBackgroundJobAction,
  clearJobHistoryAction,
} from "@/actions/background-job-actions";
import streamingRequestPool from "@/api/streaming-request-pool";
import { type BackgroundJob, type JobStatus } from "@/types/session-types";

export interface UseJobMutationsParams {
  // State setters
  setJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
  setActiveJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;

  // Data refresh function
  refreshJobs: () => Promise<void>;
}

/**
 * Hook for job mutation operations
 *
 * Handles all operations that modify jobs:
 * - Canceling active jobs
 * - Deleting jobs from history
 * - Clearing job history
 */
export function useJobMutations({
  setJobs,
  setActiveJobs,
  refreshJobs,
}: UseJobMutationsParams) {
  // Cancel a job
  const cancelJob = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        // Cancel the request in the streaming pool if active
        streamingRequestPool.cancelRequest(jobId, "User canceled");

        // Call the server action to update job status
        const result = await cancelBackgroundJobAction(jobId);

        if (!result.isSuccess) {
          throw new Error(result.message || "Failed to cancel job");
        }

        // Update local state optimistically for better UI responsiveness
        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  status: "canceled" as JobStatus,
                  statusMessage: "Canceled by user",
                  endTime: job.endTime || Date.now(),
                  updatedAt: Date.now(),
                }
              : job
          )
        );

        // Remove from active jobs
        setActiveJobs((prev) => prev.filter((job) => job.id !== jobId));

        // Refresh jobs to get the updated state
        await refreshJobs();
      } catch (err) {
        console.error("[BackgroundJobs] Error canceling job:", err);
        // Refresh to get current state if error occurred
        await refreshJobs();
        throw err;
      }
    },
    [refreshJobs, setJobs, setActiveJobs]
  );

  // Delete a job permanently from the database
  const deleteJob = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        // Call the server action to permanently delete the job
        const result = await deleteBackgroundJobAction(jobId);

        if (!result.isSuccess) {
          throw new Error(result.message || "Failed to delete job");
        }

        // Update local state by removing the job
        setJobs((prev) => prev.filter((job) => job.id !== jobId));

        // Remove from active jobs if it was active
        setActiveJobs((prev) => prev.filter((job) => job.id !== jobId));

        // Refresh jobs to get the updated state
        await refreshJobs();
      } catch (err) {
        console.error("[BackgroundJobs] Error deleting job:", err);
        // Refresh to get current state if error occurred
        await refreshJobs();
        throw err;
      }
    },
    [refreshJobs, setJobs, setActiveJobs]
  );

  // Clear job history
  const clearHistory = useCallback(
    async (daysToKeep?: number): Promise<void> => {
      try {
        const result = await clearJobHistoryAction(daysToKeep);

        if (!result.isSuccess) {
          throw new Error(result.message || "Failed to clear job history");
        }

        // Refresh jobs to ensure we have current state after clearing
        await refreshJobs();
      } catch (err) {
        console.error("[BackgroundJobs] Error clearing job history:", err);
        // Refresh to get current state if error occurred
        await refreshJobs();
        throw err;
      }
    },
    [refreshJobs]
  );

  return {
    cancelJob,
    deleteJob,
    clearHistory,
  };
}
