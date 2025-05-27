"use client";

/**
 * Utility for tracking API calls with debugging information
 * Can be used to monitor changes to important state variables like
 * projectDirectory and sessionId
 */

import { createLogger } from "./logger";

// Create a namespaced logger for API tracking
const logger = createLogger({ namespace: "API Tracker" });

// Maps to track changes to project directory and session ID
const projectDirChanges = new Map<string, number>();
const sessionIdChanges = new Map<string, number>();

/**
 * Track API calls and record state changes for debugging
 *
 * @param callName - The name/identifier of the API call
 * @param projectDir - Current project directory
 * @param sessionId - Current session ID
 * @param additionalInfo - Any additional information to record
 */
export function trackAPICall(
  callName: string,
  projectDir: string | null | undefined,
  sessionId: string | null | undefined,
  additionalInfo?: Record<string, unknown>
): void {
  // Skip tracking in production
  if (import.meta.env.PROD) {
    return;
  }

  const timestamp = Date.now();
  const formattedTime = new Date(timestamp).toISOString();

  // Track project directory changes
  if (projectDir) {
    if (!projectDirChanges.has(projectDir)) {
      logger.debug(
        `New project directory: ${projectDir} at ${formattedTime}`
      );
    }
    projectDirChanges.set(projectDir, timestamp);
  }

  // Track session ID changes
  if (sessionId) {
    if (!sessionIdChanges.has(sessionId)) {
      logger.debug(
        `New session ID: ${sessionId} at ${formattedTime}`
      );
    }
    sessionIdChanges.set(sessionId, timestamp);
  }

  // Log the API call with context
  logger.debug(`${callName} called at ${formattedTime}`, {
    projectDir,
    sessionId,
    ...additionalInfo,
  });
}

/**
 * Clear tracking data - useful for tests or when tracking gets too large
 */
export function clearAPITrackingData(): void {
  projectDirChanges.clear();
  sessionIdChanges.clear();
  logger.debug("Cleared tracking data");
}

/**
 * Get all tracked project directory changes
 */
export function getProjectDirChanges(): Record<string, number> {
  return Object.fromEntries(projectDirChanges.entries());
}

/**
 * Get all tracked session ID changes
 */
export function getSessionIdChanges(): Record<string, number> {
  return Object.fromEntries(sessionIdChanges.entries());
}
