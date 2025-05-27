import { useState, useEffect, useMemo } from "react";

import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "JobFiltering" });

/**
 * Custom hook for filtering and sorting jobs in the background jobs sidebar
 */
export function useJobFiltering(jobs: BackgroundJob[], isLoading: boolean) {
  // Keep a cached version of jobs to show during loading
  const [cachedJobs, setCachedJobs] = useState<BackgroundJob[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);

  // Update cached jobs whenever we get new jobs
  useEffect(() => {
    if (jobs.length > 0) {
      setCachedJobs(jobs);
      if (initialLoad) setInitialLoad(false);
    }
  }, [jobs, initialLoad]);

  // Memoize job filtering to prevent unnecessary recalculations on render
  const { activeJobsToShow, completedJobs, failedJobs, hasJobs } =
    useMemo(() => {
      // Track start time for performance measurement
      const startTime = performance.now();

      // Use cached jobs during loading to prevent UI flicker
      const jobsToUse = isLoading && cachedJobs.length > 0 ? cachedJobs : jobs;

      logger.debug(
        `Filtering ${jobsToUse.length} jobs (cached=${isLoading && cachedJobs.length > 0})`
      );

      // Log job status distribution for debugging
      const statusCounts = jobsToUse.reduce(
        (acc: Record<string, number>, job: BackgroundJob) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      logger.debug(
        `Jobs status distribution:`,
        statusCounts
      );

      // Use the centralized constants for status categories to ensure consistency
      const ACTIVE_STATUSES = JOB_STATUSES.ACTIVE;
      const COMPLETED_STATUSES = JOB_STATUSES.COMPLETED;
      const FAILED_STATUSES = JOB_STATUSES.FAILED;

      // Create a safe compare function for timestamps that handles undefined/null values
      const safeCompare = (
        a: BackgroundJob,
        b: BackgroundJob,
        // Array of property names to check in order of preference
        props: Array<keyof BackgroundJob>
      ) => {
        // Find the first valid property to compare
        for (const prop of props) {
          const aVal = a[prop] as number | undefined | null;
          const bVal = b[prop] as number | undefined | null;

          // Only use this property if both values are valid numbers
          if (typeof aVal === "number" && typeof bVal === "number") {
            return bVal - aVal; // Descending order (newest first)
          }
        }
        // Fallback to creation time - every job should have this
        return (b.createdAt || 0) - (a.createdAt || 0);
      };

      // Active jobs - filter for status and sort by most recently updated
      const activeList = jobsToUse
        .filter((job: BackgroundJob) => ACTIVE_STATUSES.includes(job.status))
        .sort((a: BackgroundJob, b: BackgroundJob) =>
          safeCompare(a, b, ["updatedAt", "startTime", "lastUpdate"])
        );

      // Completed jobs - filter for status and sort by most recently completed
      const completedList = jobsToUse
        .filter((job: BackgroundJob) => COMPLETED_STATUSES.includes(job.status))
        .sort((a: BackgroundJob, b: BackgroundJob) =>
          safeCompare(a, b, ["endTime", "updatedAt", "lastUpdate"])
        );

      // Failed or canceled jobs - filter for status and sort by most recent
      const failedList = jobsToUse
        .filter((job: BackgroundJob) => FAILED_STATUSES.includes(job.status))
        .sort((a: BackgroundJob, b: BackgroundJob) =>
          safeCompare(a, b, ["endTime", "updatedAt", "lastUpdate"])
        );

      const duration = performance.now() - startTime;
      logger.debug(
        `Filtered jobs in ${Math.round(duration)}ms:`,
        {
          active: activeList.length,
          completed: completedList.length,
          failed: failedList.length,
          total: jobsToUse.length,
        }
      );

      return {
        activeJobsToShow: activeList,
        completedJobs: completedList,
        failedJobs: failedList,
        hasJobs: jobsToUse.length > 0,
      };
    }, [jobs, cachedJobs, isLoading]);

  // Show loading only on first load, otherwise show cached content during updates
  const shouldShowLoading = initialLoad && isLoading && cachedJobs.length === 0;
  const shouldShowEmpty = !shouldShowLoading && !hasJobs;

  return {
    activeJobsToShow,
    completedJobs,
    failedJobs,
    hasJobs,
    shouldShowLoading,
    shouldShowEmpty,
  };
}
