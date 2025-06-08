"use client";

import { type BackgroundJob, type JobStatus, JOB_STATUSES } from "@/types/session-types";

// Polling interval in milliseconds
export const POLLING_INTERVAL = 1500;

/**
 * Helper function to compare two job arrays for equality
 * Used to prevent unnecessary state updates when the job data hasn't changed
 */
export function areJobArraysEqual(
  arr1: BackgroundJob[],
  arr2: BackgroundJob[]
): boolean {
  if (arr1.length !== arr2.length) return false;

  // Create a mapping of jobs by id for the second array for faster lookups
  const arr2JobsById = new Map(arr2.map((job) => [job.id, job]));

  // Check if each job in arr1 exists in arr2 and has the same properties
  return arr1.every((job1) => {
    const job2 = arr2JobsById.get(job1.id);
    if (!job2) return false;

    // Check status, which is most likely to change
    if (job1.status !== job2.status) return false;

    // Check updatedAt, which is a good indicator of changes
    if (job1.updatedAt !== job2.updatedAt) return false;


    return true;
  });
}

/**
 * Determine if a job is in a terminal state (completed, failed, or canceled)
 */
export function isJobTerminated(status: JobStatus): boolean {
  return !JOB_STATUSES.ACTIVE.includes(status);
}
