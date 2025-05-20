"use client";

/**
 * Format a timestamp for display
 */
export function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return "N/A";
  return new Date(timestamp).toLocaleString();
}

/**
 * Calculate job duration in seconds
 */
export function calculateJobDuration(
  startTime?: number,
  endTime?: number
): number | null {
  if (!startTime) return null;
  const end = endTime || Date.now();
  return Math.round((end - startTime) / 1000);
}

/**
 * Format job duration for display
 */
export function formatJobDuration(duration: number | null): string {
  if (duration === null) return "N/A";

  if (duration < 60) {
    return `${duration}s`;
  }

  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m ${seconds}s`;
}
