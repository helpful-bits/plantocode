"use client";

import { useBackgroundJobs } from "@/contexts/background-jobs/useBackgroundJobs";
import type { BackgroundJob, JobMetadata } from "@/types/session-types";

/**
 * Type-safe wrapper for useBackgroundJob hook
 * This provides proper TypeScript type safety for background job access
 * 
 * @param jobId The ID of the job to retrieve, or null
 * @returns An object with properly typed job data and related states
 */
export function useTypedBackgroundJob(jobId: string | null) {
  const backgroundJobs = useBackgroundJobs();
  const job = jobId ? backgroundJobs.jobs.find(j => j.id === jobId) as BackgroundJob | undefined : undefined;
  
  // Create a properly typed version of the job result
  return {
    job: job || null,
    isLoading: backgroundJobs.isLoading || false,
    error: backgroundJobs.error || null,
    status: job?.status as BackgroundJob["status"] | null,
    response: job?.response as string | null,
    errorMessage: job?.errorMessage as string | null,
    metadata: job?.metadata as JobMetadata | null,
  };
}