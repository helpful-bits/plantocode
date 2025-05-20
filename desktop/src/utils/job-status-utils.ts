"use client";

import { type JobStatus, JOB_STATUSES } from "@/types/session-types";

/**
 * Determine if a job is in a terminal state (completed, failed, or canceled)
 */
export function isJobTerminated(status: JobStatus): boolean {
  return !JOB_STATUSES.ACTIVE.includes(status);
}

/**
 * Format a timestamp as a human-readable date/time string
 */
export function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) return "N/A";
  return new Date(timestamp).toLocaleString();
}

/**
 * Calculate the duration of a job in milliseconds
 */
export function calculateJobDuration(
  startTime: number | null | undefined,
  endTime: number | null | undefined
): number | null {
  if (!startTime) return null;
  const end = endTime || Date.now();
  return end - startTime;
}

/**
 * Format a job duration as a human-readable string
 */
export function formatJobDuration(
  startTime: number | null | undefined,
  endTime: number | null | undefined
): string {
  const duration = calculateJobDuration(startTime, endTime);
  if (duration === null) return "N/A";

  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${Math.round(duration / 1000)}s`;
  return `${Math.round(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`;
}
