/**
 * Rate limiting utility
 *
 * Provides a mechanism to rate limit API requests based on a key, with configurable
 * limits and time windows. Uses intelligent cleanup-on-access pattern to avoid
 * memory leaks without requiring interval timers.
 */

import { createLogger } from '@/utils/logger';

const logger = createLogger({ namespace: "RateLimit" });

// Track request timestamps by key with last access time for intelligent cleanup
interface RateLimitEntry {
  timestamps: number[];
  lastAccess: number;
}

const rateLimitStore: Map<string, RateLimitEntry> = new Map();

// Maximum age for cleanup (1 hour)
const MAX_ENTRY_AGE = 60 * 60 * 1000;

// Perform cleanup-on-access - clean expired entries when we access the store
const cleanupOnAccess = () => {
  const now = Date.now();
  const staleEntries: string[] = [];
  
  // Find entries that haven't been accessed recently
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.lastAccess > MAX_ENTRY_AGE) {
      staleEntries.push(key);
    }
  }
  
  // Remove stale entries
  for (const key of staleEntries) {
    rateLimitStore.delete(key);
  }
  
  // Only log if we actually cleaned up entries
  if (staleEntries.length > 0) {
    logger.debug(
      `[Rate Limit] Cleaned up ${staleEntries.length} stale entries. Current size: ${rateLimitStore.size} keys`
    );
  }
};

// Clean up expired timestamps within an entry
const cleanupEntry = (entry: RateLimitEntry, windowStart: number): number[] => {
  const recentTimestamps = entry.timestamps.filter((time) => time > windowStart);
  entry.timestamps = recentTimestamps;
  entry.lastAccess = Date.now();
  return recentTimestamps;
};

/**
 * Check if a request should be rate limited based on a key, limit count, and time window
 *
 * @param key Unique key to track rate limits for (e.g., IP + endpoint + resource)
 * @param limit Maximum number of requests allowed in the time window
 * @param windowSeconds Time window in seconds
 * @returns Boolean indicating if the request should be rate limited
 */
export function rateLimitCheck(
  key: string,
  limit: number,
  windowSeconds: number
): boolean {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  // Intelligent cleanup-on-access - clean stale entries periodically
  // Only run cleanup occasionally to avoid overhead on every request
  if (Math.random() < 0.1) { // 10% chance to run cleanup
    cleanupOnAccess();
  }

  // Get existing entry for this key
  const existingEntry = rateLimitStore.get(key);
  
  let recentTimestamps: number[];
  
  if (existingEntry) {
    // Clean up expired timestamps and update last access
    recentTimestamps = cleanupEntry(existingEntry, windowStart);
  } else {
    // No existing entry
    recentTimestamps = [];
  }

  // Check if we're over the limit
  if (recentTimestamps.length >= limit) {
    // Calculate when the rate limit will reset
    const oldestTimestamp = Math.min(...recentTimestamps);
    const resetTime = oldestTimestamp + windowMs;
    const resetInSeconds = Math.ceil((resetTime - now) / 1000);

    // Convert recent timestamps to readable format for debugging
    const recentTimes = recentTimestamps
      .map((ts) => new Date(ts).toISOString().split("T")[1].slice(0, -1))
      .slice(-5) // Show only last 5 timestamps for brevity
      .join(", ");

    // Calculate request distribution within the window (for burst detection)
    let burstDetected = false;
    if (recentTimestamps.length > 2) {
      // Check if more than half the requests came in the last quarter of the window
      const recentWindow = now - windowMs / 4;
      const recentCount = recentTimestamps.filter(
        (ts) => ts > recentWindow
      ).length;
      burstDetected = recentCount > limit / 2;
    }

    // Log is used for debugging rate limit exceeded events
    logger.debug(
      `[Rate Limit] Rate limit exceeded for key: ${key}. ` +
        `${recentTimestamps.length}/${limit} requests in last ${windowSeconds}s. ` +
        `Reset in ~${resetInSeconds}s. ` +
        `${burstDetected ? "BURST DETECTED!" : "Normal distribution"}. ` +
        `Recent timestamps: ${recentTimes}`
    );

    return true; // Rate limited
  }

  // Add current timestamp
  recentTimestamps.push(now);

  // Update or create store entry with intelligent structure
  if (existingEntry) {
    existingEntry.timestamps = recentTimestamps;
    existingEntry.lastAccess = now;
  } else {
    rateLimitStore.set(key, {
      timestamps: recentTimestamps,
      lastAccess: now,
    });
  }

  // Only log rate limit status when approaching the limit (75% or more)
  const approachingLimit = recentTimestamps.length >= Math.ceil(limit * 0.75);
  if (approachingLimit) {
    // Log is used for debugging approaching rate limit events
    logger.debug(
      `[Rate Limit] Approaching limit for key: ${key}. ` +
        `${recentTimestamps.length}/${limit} requests in last ${windowSeconds}s.`
    );
  }

  return false; // Not rate limited
}

/**
 * Manually trigger cleanup of expired entries (for testing or manual cleanup)
 */
export function forceCleanup(): void {
  cleanupOnAccess();
}
