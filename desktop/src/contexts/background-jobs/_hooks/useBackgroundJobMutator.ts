import { useCallback } from "react";

import {
  cancelBackgroundJobAction,
  deleteBackgroundJobAction,
  clearJobHistoryAction,
} from "@/actions/background-jobs";
import { type BackgroundJob } from "@/types/session-types";

export interface UseBackgroundJobMutatorParams {
  setJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
  setActiveJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
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
export function useBackgroundJobMutator({
  setJobs,
  setActiveJobs,
  refreshJobs,
}: UseBackgroundJobMutatorParams) {
  // Cancel a job
  const cancelJob = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        // Call the Tauri command to cancel the job
        const result = await cancelBackgroundJobAction(jobId);

        if (!result.isSuccess) {
          console.error(
            "[BackgroundJobs] Error canceling job:",
            result.message
          );
          await refreshJobs();
          throw new Error(result.message);
        }

        // Update local state optimistically for better UI responsiveness
        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  status: "canceled",
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
        // Call the Tauri command to permanently delete the job
        const result = await deleteBackgroundJobAction(jobId);

        if (!result.isSuccess) {
          console.error("[BackgroundJobs] Error deleting job:", result.message);
          await refreshJobs();
          throw new Error(result.message);
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
        // Call the Tauri command to clear job history
        const result = await clearJobHistoryAction(daysToKeep);

        if (!result.isSuccess) {
          console.error(
            "[BackgroundJobs] Error clearing job history:",
            result.message
          );
          await refreshJobs();
          throw new Error(result.message);
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
