"use client";

import { useBackgroundJobs } from "../background-jobs/useBackgroundJobs";

/**
 * Custom hook to filter active jobs by type
 *
 * @param type The task type to filter by
 * @returns An array of active jobs of the specified type
 */
export function useActiveJobsByType(type: string) {
  const { activeJobs } = useBackgroundJobs();
  return activeJobs.filter(
    (job: { taskType: string }) => job.taskType === type
  );
}
