"use client";

import { useMemo } from "react";
import { useBackgroundJobs } from "@/contexts/background-jobs/useBackgroundJobs";
import type { BackgroundJob } from "@/types/session-types";
import { getParsedMetadata } from "@/app/components/background-jobs-sidebar/utils";

/**
 * Type-safe wrapper for useBackgroundJob hook
 * This provides proper TypeScript type safety for background job access
 * 
 * @param jobId The ID of the job to retrieve, or null
 * @returns An object with properly typed job data and related states
 */
export function useTypedBackgroundJob(jobId: string | null) {
  const { jobs: allJobs, isLoading, error, getJobById } = useBackgroundJobs();

  const job = useMemo(() => {
    return jobId ? getJobById(jobId) : null;
  }, [jobId, getJobById, allJobs]);

  return useMemo(() => ({
    job: job || null,
    isLoading: isLoading || false,
    error: error || null,
    status: job?.status as BackgroundJob["status"] | null,
    response: job?.response as string | null,
    errorMessage: job?.errorMessage as string | null,
    metadata: getParsedMetadata(job?.metadata),
  }), [job, isLoading, error]);
}