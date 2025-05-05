/**
 * API Handler for Session Sync Service
 * 
 * Handles API interactions for session operations, including error handling
 * and retry logic.
 */

import { SessionApiResponse } from './types';
import { Session } from '@/types/session-types';

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 500, // Start with 500ms delay
  maxDelayMs: 5000, // Cap at 5 seconds
};

// Track last updates for each session to prevent too frequent calls
const lastSessionUpdates = new Map<string, { timestamp: number, fields: string[] }>();
const UPDATE_COOLDOWN = 10000; // 10 seconds minimum between updates to the same session (increased from 8s)
const FORCED_UPDATE_THROTTLE = 60000; // 1 minute period for tracking forced update counts
const MAX_FORCED_UPDATES = 8; // Max number of forced updates per minute per session (reduced from 10)

// Track forced updates that bypass rate limiting
const forcedUpdates = new Map<string, { count: number, firstUpdate: number }>();

// Track update patterns to identify potentially problematic code
const updatePatterns = new Map<string, {
  count: number,
  firstUpdate: number,
  lastUpdate: number,
  fields: Record<string, number>,
  sources: Record<string, number>
}>();

// Extract source information from stack trace
function extractSource(stack?: string): string {
  if (!stack) return 'unknown';
  const stackLines = stack.split('\n');
  // Try to find a non-API-handler source
  for (const line of stackLines) {
    if (line.includes('/') && !line.includes('api-handler') && !line.includes('node_modules')) {
      const match = line.match(/at\s+(?:\w+\s+\()?([^)]+)/);
      return match ? match[1] : line;
    }
  }
  return stackLines[2] || 'unknown'; // Default to the second line in the stack
}

/**
 * Check if a session update should be rate limited
 */
function shouldRateLimitUpdate(
  sessionId: string, 
  updateFields: string[], 
  source: string = 'unknown'
): boolean {
  const now = Date.now();
  const lastUpdate = lastSessionUpdates.get(sessionId);
  
  // Track update patterns for this session
  const sessionKey = sessionId || 'new';
  if (!updatePatterns.has(sessionKey)) {
    updatePatterns.set(sessionKey, {
      count: 1,
      firstUpdate: now,
      lastUpdate: now,
      fields: updateFields.reduce((acc, field) => ({...acc, [field]: 1}), {}),
      sources: { [source]: 1 }
    });
  } else {
    const pattern = updatePatterns.get(sessionKey)!;
    pattern.count++;
    pattern.lastUpdate = now;
    
    // Track frequency of updated fields
    updateFields.forEach(field => {
      pattern.fields[field] = (pattern.fields[field] || 0) + 1;
    });
    
    // Track update sources
    pattern.sources[source] = (pattern.sources[source] || 0) + 1;
    
    // Log potentially problematic update patterns every 10 updates
    if (pattern.count % 10 === 0) {
      const timeSpan = (now - pattern.firstUpdate) / 1000;
      const updatesPerMinute = (pattern.count / timeSpan) * 60;
      
      if (updatesPerMinute > 10) {
        console.warn(`[ApiHandler] Potential update storm detected for session ${sessionKey}:`);
        console.warn(`  - ${pattern.count} updates in ${timeSpan.toFixed(1)}s (${updatesPerMinute.toFixed(1)} updates/min)`);
        console.warn(`  - Most updated fields: ${Object.entries(pattern.fields)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([field, count]) => `${field}(${count})`)
          .join(', ')}`);
        console.warn(`  - Top update sources: ${Object.entries(pattern.sources)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([src, count]) => `${src}(${count})`)
          .join(', ')}`);
      }
      
      // Reset after 5 minutes to avoid stale data
      if (now - pattern.firstUpdate > 300000) {
        updatePatterns.set(sessionKey, {
          count: 1,
          firstUpdate: now,
          lastUpdate: now,
          fields: updateFields.reduce((acc, field) => ({...acc, [field]: 1}), {}),
          sources: { [source]: 1 }
        });
      }
    }
  }
  
  if (!lastUpdate) {
    // First update for this session
    lastSessionUpdates.set(sessionId, { timestamp: now, fields: updateFields });
    return false;
  }
  
  const timeSinceLastUpdate = now - lastUpdate.timestamp;
  
  // If updating the same session within the cooldown period
  if (timeSinceLastUpdate < UPDATE_COOLDOWN) {
    // Check if we're updating the same fields
    const sameFields = updateFields.every(field => lastUpdate.fields.includes(field)) &&
                     lastUpdate.fields.every(field => updateFields.includes(field));
    
    if (sameFields) {
      console.log(`[ApiHandler] Rate limiting update to session ${sessionId}: same fields updated too soon (${timeSinceLastUpdate}ms)`);
      console.log(`[ApiHandler] Update source: ${source}`);
      return true;
    }
    
    // Even if different fields, limit overall update frequency
    if (timeSinceLastUpdate < 2000) { // Increased from 1000ms to 2000ms
      // Special exception for active session changes - allow higher frequency
      if (sessionId.startsWith('active-') && updateFields.includes('activeSession')) {
        // Only rate limit active session updates if they happen less than 500ms apart
        // This allows for more responsive session switching
        if (timeSinceLastUpdate < 500) {
          console.log(`[ApiHandler] Rate limiting active session update: extremely rapid calls (${timeSinceLastUpdate}ms)`);
          console.log(`[ApiHandler] Update source: ${source}`);
          return true;
        }
      } else {
        console.log(`[ApiHandler] Rate limiting update to session ${sessionId}: updates too frequent (${timeSinceLastUpdate}ms)`);
        console.log(`[ApiHandler] Update source: ${source}`);
        return true;
      }
    }
  }
  
  // Update the last update time and fields
  lastSessionUpdates.set(sessionId, { timestamp: now, fields: updateFields });
  
  // Clean up old entries if there are too many
  if (lastSessionUpdates.size > 100) {
    const deleteThreshold = now - 600000; // 10 minutes
    for (const [key, value] of lastSessionUpdates.entries()) {
      if (value.timestamp < deleteThreshold) {
        lastSessionUpdates.delete(key);
      }
    }
  }
  
  return false;
}

/**
 * Set the active session for a project directory
 * @param priority If true, this operation will bypass rate limiting
 */
export async function setActiveSession(
  projectDirectory: string,
  sessionId: string | null,
  operationId: string,
  priority: boolean = false
): Promise<void> {
  try {
    const startTime = Date.now();
    console.log(`[ApiHandler] Setting active session to ${sessionId || 'null'} for project ${projectDirectory} (Operation: ${operationId})`);
    
    // Add call stack logging to identify the source of frequent calls
    const callStack = new Error().stack;
    const source = extractSource(callStack);
    console.log(`[ApiHandler] setActiveSession call source: ${source}`);
    
    // Apply rate limiting to setActiveSession calls, except for priority operations
    const sessionKey = `active-${projectDirectory}`;
    if (!priority && shouldRateLimitUpdate(sessionKey, ['activeSession'], source)) {
      console.log(`[ApiHandler] Rate limiting setActiveSession operation ${operationId} for project ${projectDirectory}`);
      return;
    }
    
    if (priority) {
      console.log(`[ApiHandler] Bypassing rate limiting for priority setActiveSession operation ${operationId}`);
    }
    
    console.time(`[Perf] setActiveSession API call ${operationId}`);
    
    // Use the actual API endpoint which is /api/active-session
    const response = await fetch('/api/active-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operation-ID': operationId,
      },
      body: JSON.stringify({
        projectDirectory,
        sessionId,
      }),
    });

    const apiDuration = Date.now() - startTime;
    console.timeEnd(`[Perf] setActiveSession API call ${operationId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ApiHandler] Failed to set active session: ${response.status} ${errorText} (Duration: ${apiDuration}ms)`);
      throw new Error(`Failed to set active session: ${response.status} ${errorText}`);
    }

    // Successfully set active session
    console.log(`[ApiHandler] Successfully set active session to ${sessionId || 'null'} (Duration: ${apiDuration}ms)`);
    
    return;
  } catch (error) {
    console.error(`[ApiHandler] Error setting active session:`, error);
    throw error;
  }
}

/**
 * Get a session by ID with retry logic
 */
export async function getSessionById(
  sessionId: string,
  operationId: string
): Promise<Session | null> {
  let retryCount = 0;
  const startTime = Date.now();
  
  // Add validation for sessionId
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    console.error(`[ApiHandler] Invalid session ID type or value: ${typeof sessionId}, ${sessionId}`);
    throw new Error('Invalid session ID type or value');
  }
  
  console.log(`[ApiHandler] Getting session by ID: ${sessionId} (Operation: ${operationId})`);
  console.time(`[Perf] Full getSessionById operation ${sessionId}`);
  
  while (retryCount <= RETRY_CONFIG.maxRetries) {
    try {
      console.time(`[Perf] API fetch ${sessionId}`);
      const fetchStartTime = Date.now();
      
      console.log(`[Perf] Initiating fetch for session ${sessionId} (Operation: ${operationId})`);
      const response = await fetch(`/api/session/${sessionId}`, {
        method: 'GET',
        headers: {
          'X-Operation-ID': operationId,
          'Cache-Control': 'no-cache, no-store',
        },
      });
      
      const fetchEndTime = Date.now();
      const fetchDuration = fetchEndTime - fetchStartTime;
      console.log(`[Perf] API network time: ${fetchDuration}ms for session ${sessionId} (Operation: ${operationId})`);

      if (!response.ok) {
        console.timeEnd(`[Perf] API fetch ${sessionId}`);
        const errorText = await response.text();
        const statusCode = response.status;
        console.error(`[ApiHandler] Failed API response: ${statusCode} ${errorText} for session ${sessionId} (Operation: ${operationId})`);
        throw new Error(`Failed to get session: ${statusCode} ${errorText}`);
      }

      console.time(`[Perf] API response parsing ${sessionId}`);
      const parseStartTime = Date.now();
      const data = await response.json() as SessionApiResponse;
      const parseDuration = Date.now() - parseStartTime;
      console.timeEnd(`[Perf] API response parsing ${sessionId}`);
      console.log(`[Perf] API response parsing time: ${parseDuration}ms for session ${sessionId} (Operation: ${operationId})`);
      
      if (!data.session) {
        console.timeEnd(`[Perf] API fetch ${sessionId}`);
        console.warn(`[ApiHandler] Session ${sessionId} not found or empty response (Operation: ${operationId})`);
        console.timeEnd(`[Perf] Full getSessionById operation ${sessionId}`);
        return null;
      }
      
      // Get details about the session size
      const includedFilesCount = data.session.includedFiles?.length || 0;
      const excludedFilesCount = data.session.forceExcludedFiles?.length || 0;
      const totalFilesCount = includedFilesCount + excludedFilesCount;
      const responseSize = JSON.stringify(data).length;
      
      console.timeEnd(`[Perf] API fetch ${sessionId}`);
      const apiRequestDuration = Date.now() - fetchStartTime;
      const totalDuration = Date.now() - startTime;
      
      console.log(`[Perf] Session data details for ${sessionId} (Operation: ${operationId}): 
        Included files: ${includedFilesCount}
        Excluded files: ${excludedFilesCount}
        Total files: ${totalFilesCount}
        Response size: ${Math.round(responseSize / 1024)}KB
      `);
      
      console.log(`[Perf] API timing breakdown for ${sessionId} (Operation: ${operationId}):
        Network request: ${fetchDuration}ms (${Math.round(fetchDuration/apiRequestDuration*100)}%)
        Response parsing: ${parseDuration}ms (${Math.round(parseDuration/apiRequestDuration*100)}%)
        Total API request: ${apiRequestDuration}ms
        Total operation with retries: ${totalDuration}ms
      `);
      
      console.timeEnd(`[Perf] Full getSessionById operation ${sessionId}`);
      return data.session;
    } catch (error) {
      retryCount++;
      
      // Extract error details
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusMatch = errorMessage.match(/Failed to get session: (\d+)/);
      const statusCode = statusMatch ? statusMatch[1] : 'unknown';
      
      if (retryCount > RETRY_CONFIG.maxRetries) {
        // Log comprehensive information about the final failure
        console.error(`[ApiHandler] FINAL FAILURE: Session retrieval failed after ${RETRY_CONFIG.maxRetries} retries for session ${sessionId} (Operation: ${operationId})`);
        console.error(`[ApiHandler] Final error details: Status ${statusCode}, Message: ${errorMessage}`);
        console.log(`[Perf] Failed API request total time: ${Date.now() - startTime}ms for session ${sessionId}`);
        
        // Ensure all performance timers are properly ended
        try { console.timeEnd(`[Perf] API fetch ${sessionId}`); } catch (e) {}
        console.timeEnd(`[Perf] Full getSessionById operation ${sessionId}`);
        
        // Rethrow with enhanced message
        throw new Error(`Failed to get session ${sessionId} after ${RETRY_CONFIG.maxRetries} retries: ${errorMessage}`);
      }
      
      // Calculate exponential backoff with jitter
      const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, retryCount - 1) + Math.random() * 100,
        RETRY_CONFIG.maxDelayMs
      );
      
      console.warn(`[ApiHandler] Retry ${retryCount}/${RETRY_CONFIG.maxRetries} after ${delay}ms for session ${sessionId} (Operation: ${operationId})`);
      console.warn(`[ApiHandler] Retry reason: Status ${statusCode}, Error: ${errorMessage}`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached due to the throw in the catch block
  // But ensure we end any pending performance timers just in case
  try { console.timeEnd(`[Perf] API fetch ${sessionId}`); } catch (e) {}
  console.timeEnd(`[Perf] Full getSessionById operation ${sessionId}`);
  return null;
}

/**
 * Update session state with retry logic
 */
export async function patchSessionStateFields(
  sessionId: string,
  sessionData: Partial<Session>,
  operationId: string
): Promise<void> {
  let retryCount = 0;
  const startTime = Date.now();
  
  // Get call stack to trace update sources
  const callStack = new Error().stack;
  const source = extractSource(callStack);
  
  // Extract updated fields for rate limiting
  const updatedFields = Object.keys(sessionData);
  
  // Apply rate limiting
  const shouldLimit = shouldRateLimitUpdate(sessionId, updatedFields, source);
  
  if (shouldLimit) {
    // Check if this is an important update that we should force through anyway
    const containsCriticalFields = 
      updatedFields.includes('projectDirectory') || 
      updatedFields.includes('activeSessionId') ||
      updatedFields.some(field => field.includes('Task'));
    
    // Track forced updates for this session to prevent abuse
    if (containsCriticalFields) {
      const now = Date.now();
      if (!forcedUpdates.has(sessionId)) {
        forcedUpdates.set(sessionId, { count: 1, firstUpdate: now });
      } else {
        const forced = forcedUpdates.get(sessionId)!;
        
        // Reset counter if outside the tracking window
        if (now - forced.firstUpdate > FORCED_UPDATE_THROTTLE) {
          forcedUpdates.set(sessionId, { count: 1, firstUpdate: now });
        } else {
          // Increment count within the window
          forced.count++;
          
          // Block if too many forced updates
          if (forced.count > MAX_FORCED_UPDATES) {
            console.warn(`[ApiHandler] Blocking forced update: exceeded limit of ${MAX_FORCED_UPDATES} per minute for session ${sessionId}`);
            console.warn(`[ApiHandler] Fields: ${updatedFields.join(', ')}, Source: ${source}`);
            return;
          }
        }
      }
      
      console.log(`[ApiHandler] Forcing critical update despite rate limiting for session ${sessionId}`);
      console.log(`[ApiHandler] Fields: ${updatedFields.join(', ')}, Forced count: ${forcedUpdates.get(sessionId)!.count}`);
    } else {
      console.log(`[ApiHandler] Rate limiting patchSessionStateFields for session ${sessionId} (Operation: ${operationId})`);
      console.log(`[ApiHandler] Fields: ${updatedFields.join(', ')}`);
      console.log(`[ApiHandler] Source: ${source}`);
      // Return early without error to avoid triggering retries
      return;
    }
  }
  
  // LOG the details of the update
  console.log(`[ApiHandler] Updating session state for ${sessionId} (Operation: ${operationId})`);
  console.log(`[ApiHandler] Update source: ${source}`);
  console.log(`[ApiHandler] Fields being updated: ${updatedFields.join(', ')}`);
  console.time(`[Perf] patchSessionStateFields API call ${operationId}`);
  
  while (retryCount <= RETRY_CONFIG.maxRetries) {
    try {
      const response = await fetch(`/api/session/${sessionId}/state`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Operation-ID': operationId,
        },
        body: JSON.stringify(sessionData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ApiHandler] Failed to update session state: ${response.status} ${errorText}`);
        throw new Error(`Failed to update session: ${response.status} ${errorText}`);
      }

      const apiDuration = Date.now() - startTime;
      console.timeEnd(`[Perf] patchSessionStateFields API call ${operationId}`);
      console.log(`[ApiHandler] Successfully updated session ${sessionId} in ${apiDuration}ms (Operation: ${operationId})`);
      
      return;
    } catch (error) {
      retryCount++;
      console.error(`[ApiHandler] Error updating session state (attempt ${retryCount}):`, error);
      
      if (retryCount > RETRY_CONFIG.maxRetries) {
        console.timeEnd(`[Perf] patchSessionStateFields API call ${operationId}`);
        throw error;
      }
      
      // Calculate exponential backoff with jitter
      const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, retryCount - 1) + Math.random() * 100,
        RETRY_CONFIG.maxDelayMs
      );
      
      console.warn(`[ApiHandler] Retrying update after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
} 