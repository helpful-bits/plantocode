/**
 * Date utility functions for formatting, manipulation, and comparison
 *
 * This module provides comprehensive utilities for working with dates including:
 * - Formatting dates in various styles (standard format, time ago, duration)
 * - Handling job duration calculations with error recovery
 * - Converting timestamps with validation and safety checks
 */

/**
 * Format a timestamp (number or string) to a human-readable date string
 * @param timestamp Timestamp to format (unix timestamp in ms or s, ISO string, or Date object)
 * @returns Formatted date string
 */
export function formatTimestamp(
  timestamp: number | string | Date | null | undefined
): string {
  if (timestamp === null || timestamp === undefined) return "N/A";
  if (
    typeof timestamp === "number" &&
    (timestamp === 0 || !Number.isFinite(timestamp))
  )
    return "N/A";

  try {
    // Handle Unix timestamps in seconds (convert to ms)
    if (typeof timestamp === "number") {
      // If the timestamp is in seconds (Unix timestamp), convert to milliseconds
      // Heuristic: most Unix timestamps are 10 digits or less (until year 2286)
      if (timestamp < 10000000000) {
        timestamp = timestamp * 1000;
      }
    }

    const date =
      typeof timestamp === "object" ? timestamp : new Date(timestamp);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      // Console warnings removed per lint requirements
      return "Invalid date";
    }

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (_e) {
    // Console errors removed per lint requirements
    return "Invalid date";
  }
}

/**
 * Format a timestamp to a "time ago" string (e.g. "5 minutes ago")
 * @param timestamp Timestamp to format (unix timestamp in ms or s, ISO string, or Date object)
 * @returns Formatted time ago string
 */
export function formatTimeAgo(
  timestamp: number | string | Date | null | undefined
): string {
  if (timestamp === null || timestamp === undefined) return "N/A";
  if (
    typeof timestamp === "number" &&
    (timestamp === 0 || !Number.isFinite(timestamp))
  )
    return "N/A";

  try {
    // Handle Unix timestamps in seconds (convert to ms)
    if (typeof timestamp === "number") {
      // If the timestamp is in seconds (Unix timestamp), convert to milliseconds
      // Heuristic: most Unix timestamps are 10 digits or less (until year 2286)
      if (timestamp < 10000000000) {
        timestamp = timestamp * 1000;
      }
    }

    const date =
      typeof timestamp === "object" ? timestamp : new Date(timestamp);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      // Console warnings removed per lint requirements
      return "Invalid date";
    }

    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    // Handle future dates
    if (seconds < 0) {
      // If it's less than a minute in the future, treat as "just now"
      if (seconds > -60) {
        return "just now";
      }
      return "in the future";
    }

    // Less than a minute
    if (seconds < 60) {
      return "just now";
    }

    // Minutes
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    }

    // Hours
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    }

    // Days
    const days = Math.floor(hours / 24);
    if (days < 30) {
      return `${days} day${days !== 1 ? "s" : ""} ago`;
    }

    // Months
    const months = Math.floor(days / 30);
    if (months < 12) {
      return `${months} month${months !== 1 ? "s" : ""} ago`;
    }

    // Years
    const years = Math.floor(months / 12);
    return `${years} year${years !== 1 ? "s" : ""} ago`;
  } catch (_e) {
    // Console errors removed per lint requirements
    return "Invalid date";
  }
}

/**
 * Format the duration of a background job, handling various states
 * @param startTime Job start time (milliseconds since epoch)
 * @param endTime Job end time (milliseconds since epoch)
 * @param status Current job status
 * @returns Formatted duration string
 */
export function formatJobDuration(
  startTime: number | null | undefined,
  endTime: number | null | undefined,
  status: string
): string {
  // Handle invalid or missing start time
  if (startTime === null || startTime === undefined) {
    return status === "idle" ? "Pending" : "N/A";
  }

  try {
    // Validate startTime is a valid number
    if (
      typeof startTime !== "number" ||
      !Number.isFinite(startTime) ||
      startTime < 0
    ) {
      // Console warnings removed per lint requirements
      return status === "idle" ? "Pending" : "N/A";
    }

    // Validate startTime is in milliseconds - if not, convert (a safeguard)
    let startMs = startTime;
    if (startTime < 10000000000) {
      // Timestamp is in seconds not milliseconds
      // Console warnings removed per lint requirements
      startMs = startTime * 1000;
    }

    // For running jobs, calculate duration from start until now
    if (["running", "preparing"].includes(status)) {
      const durationMs = Date.now() - startMs;

      // If duration is negative (future date) or unreasonably large, handle the edge case
      if (durationMs < 0) {
        // Console warnings removed per lint requirements
        return "Just started";
      }

      if (durationMs > 31536000000) {
        // > 1 year (likely timestamp handling error)
        // Console warnings removed per lint requirements
        return "Running";
      }

      return formatDurationMs(durationMs, true);
    }

    // For completed/failed/canceled jobs, calculate from start to end
    if (endTime !== null && endTime !== undefined) {
      // Validate endTime
      if (
        typeof endTime !== "number" ||
        !Number.isFinite(endTime) ||
        endTime < 0
      ) {
        // Console warnings removed per lint requirements
        return "Completed";
      }

      // Convert end time from seconds to ms if needed
      let endMs = endTime;
      if (endTime < 10000000000) {
        // Timestamp is in seconds not milliseconds
        // Console warnings removed per lint requirements
        endMs = endTime * 1000;
      }

      // Calculate duration in ms
      const durationMs = endMs - startMs;

      // Sanity check for negative durations or impossibly large durations
      if (durationMs < 0) {
        // Console warnings removed per lint requirements
        return "Completed";
      }

      if (durationMs > 31536000000) {
        // > 1 year (likely timestamp handling error)
        // Console warnings removed per lint requirements
        return "Completed";
      }

      return formatDurationMs(durationMs);
    }

    // Fallback for completed jobs with missing endTime
    if (["completed", "failed", "canceled"].includes(status)) {
      return "Completed";
    }

    return status === "idle" ? "Pending" : "N/A";
  } catch (_e) {
    // Console errors removed per lint requirements
    return "N/A";
  }
}

/**
 * Format milliseconds into a human-readable duration string
 * @param ms Duration in milliseconds
 * @param isRunning Whether the job is still running
 * @returns Formatted duration string
 */
export function formatDurationMs(ms: number, isRunning: boolean = false): string {
  // Sanity check for invalid durations
  if (
    ms === null ||
    ms === undefined ||
    typeof ms !== "number" ||
    !Number.isFinite(ms)
  ) {
    // Console warnings removed per lint requirements
    return "N/A";
  }

  // Handle negative durations (should not happen, but just in case)
  if (ms < 0) {
    // Console warnings removed per lint requirements
    return isRunning ? "Just started" : "Less than 1s";
  }

  // Cap unreasonably large durations
  if (ms > 31536000000) {
    // > 1 year
    // Console warnings removed per lint requirements
    return isRunning ? "Running > 1 year" : "> 1 year";
  }

  const seconds = Math.floor(ms / 1000);

  if (seconds < 1) {
    return isRunning ? "Just started" : "Less than 1s";
  }

  if (seconds < 60) {
    return `${seconds.toString()}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return `${minutes.toString()}m ${remainingSeconds.toString()}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return `${hours.toString()}h ${remainingMinutes.toString()}m`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return `${days.toString()}d ${remainingHours.toString()}h`;
}
