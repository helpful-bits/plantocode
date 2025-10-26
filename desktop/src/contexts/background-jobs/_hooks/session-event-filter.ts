/**
 * Session-based event filtering for background jobs
 *
 * This module provides utilities to filter background job events based on session IDs,
 * ensuring that only events relevant to the current active session are processed.
 */

export interface SessionFilterInput {
  /**
   * The currently active session ID
   */
  activeSessionId?: string;

  /**
   * The session ID found in the event payload
   */
  payloadSessionId?: string;

  /**
   * The session ID of an existing job in the local job map
   */
  existingJobSessionId?: string;

  /**
   * Whether this is a job creation event that requires payload session ID
   */
  requirePayloadForCreate?: boolean;
}

/**
 * Determines whether a background job event should be processed based on session matching
 *
 * Filtering logic:
 * 1. If no active session, reject all events
 * 2. For create events: require exact payload session ID match
 * 3. For update events: prefer payload session ID, fallback to existing job session ID
 * 4. Reject if no usable session information is available
 *
 * @param input - The session filter input parameters
 * @returns true if the event should be processed, false otherwise
 */
export function shouldProcessEventBySession(input: SessionFilterInput): boolean {
  const {
    activeSessionId,
    payloadSessionId,
    existingJobSessionId,
    requirePayloadForCreate = false,
  } = input;

  // No active session - reject all events
  if (!activeSessionId) {
    return false;
  }

  // For create events, we must have a payload session ID and it must match
  if (requirePayloadForCreate) {
    if (!payloadSessionId) {
      return false;
    }
    return payloadSessionId === activeSessionId;
  }

  // For update/delete events, prefer payload session ID, fallback to existing job session ID
  const eventSessionId = payloadSessionId ?? existingJobSessionId;

  // No usable session information - reject
  if (!eventSessionId) {
    return false;
  }

  // Check if session matches
  return eventSessionId === activeSessionId;
}
