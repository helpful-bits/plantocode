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
 * 1. For create events: require explicit payload session ID
 * 2. If active session exists: require exact session match
 * 3. If active session is undefined (startup/switch): accept events with resolvable session scope
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

  // For create events, require explicit payload sessionId
  if (requirePayloadForCreate && !payloadSessionId) {
    return false;
  }

  // Determine the event's session scope
  const eventSessionId = payloadSessionId ?? existingJobSessionId;

  // If we have an active session, require exact match
  if (activeSessionId) {
    return eventSessionId === activeSessionId;
  }

  // When active session is temporarily unknown (startup/switch),
  // accept events that have a resolvable session scope
  // This prevents dropping valid events during transient gaps
  return Boolean(eventSessionId);
}
