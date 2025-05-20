"use client";

import { useContext } from "react";

// Import directly from Provider to avoid circular dependency
import { BackgroundJobsContext } from "../background-jobs/Provider";

/**
 * Custom hook to get a specific background job by ID
 *
 * @param jobId The ID of the job to retrieve, or null
 * @returns An object with job data and related states
 */
export function useBackgroundJob(jobId: string | null) {
  const { jobs, isLoading, error } = useContext(BackgroundJobsContext);

  const job = jobId
    ? jobs.find((j: { id: string }) => j.id === jobId) || null
    : null;

  // Create a derived object with properly mapped properties
  const result = {
    job,
    isLoading,
    error,
    // Add derived properties for convenience
    status: job?.status || null,
    response: job?.response || null,
    errorMessage: job?.errorMessage || null,
    metadata: job?.metadata || null, // Expose metadata directly for convenience
  };

  return result;
}
