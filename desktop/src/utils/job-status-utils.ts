"use client";

import { type JobStatus, JOB_STATUSES } from "@/types/session-types";

/**
 * Determine if a job is in a terminal state (completed, failed, or canceled)
 */
export function isJobTerminated(status: JobStatus): boolean {
  return !JOB_STATUSES.ACTIVE.includes(status);
}



