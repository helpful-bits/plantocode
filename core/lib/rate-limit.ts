/**
 * Rate limiting utility
 * 
 * Provides a mechanism to rate limit API requests based on a key, with configurable
 * limits and time windows.
 */

// Track request timestamps by key
const rateLimitStore: Map<string, number[]> = new Map();

// Cleanup interval (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Set up periodic cleanup to prevent memory leaks
if (typeof global !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    // Clean up entries older than 1 hour
    for (const [key, timestamps] of rateLimitStore.entries()) {
      const oneHourAgo = now - (60 * 60 * 1000);
      
      // Remove all timestamps older than 1 hour
      const newTimestamps = timestamps.filter(time => time > oneHourAgo);
      
      if (newTimestamps.length === 0) {
        // Remove the key entirely if no valid timestamps remain
        rateLimitStore.delete(key);
      } else if (newTimestamps.length < timestamps.length) {
        // Update with only recent timestamps
        rateLimitStore.set(key, newTimestamps);
      }
    }
    
    console.log(`[Rate Limit] Cleaned up rate limit store. Current size: ${rateLimitStore.size} keys`);
  }, CLEANUP_INTERVAL);
}

/**
 * Check if a request should be rate limited based on a key, limit count, and time window
 * 
 * @param key Unique key to track rate limits for (e.g., IP + endpoint + resource)
 * @param limit Maximum number of requests allowed in the time window
 * @param windowSeconds Time window in seconds
 * @returns Boolean indicating if the request should be rate limited
 */
export async function rateLimitCheck(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;
  
  // Get existing timestamps for this key
  const timestamps = rateLimitStore.get(key) || [];
  
  // Filter to only include timestamps within the current window
  const recentTimestamps = timestamps.filter(time => time > windowStart);
  
  // Check if we're over the limit
  if (recentTimestamps.length >= limit) {
    // Calculate when the rate limit will reset
    const oldestTimestamp = Math.min(...recentTimestamps);
    const resetTime = oldestTimestamp + windowMs;
    const resetInSeconds = Math.ceil((resetTime - now) / 1000);
    
    // Convert recent timestamps to readable format for debugging
    const recentTimes = recentTimestamps
      .map(ts => new Date(ts).toISOString().split('T')[1].slice(0, -1))
      .slice(-5) // Show only last 5 timestamps for brevity
      .join(', ');
    
    // Calculate request distribution within the window (for burst detection)
    let burstDetected = false;
    if (recentTimestamps.length > 2) {
      // Check if more than half the requests came in the last quarter of the window
      const recentWindow = now - (windowMs / 4);
      const recentCount = recentTimestamps.filter(ts => ts > recentWindow).length;
      burstDetected = recentCount > (limit / 2);
    }
    
    console.log(`[Rate Limit] Rate limit exceeded for key: ${key}. ` +
      `${recentTimestamps.length}/${limit} requests in last ${windowSeconds}s. ` +
      `Reset in ~${resetInSeconds}s. ` +
      `${burstDetected ? 'BURST DETECTED!' : 'Normal distribution'}. ` +
      `Recent timestamps: ${recentTimes}`);
    
    return true; // Rate limited
  }
  
  // Add current timestamp
  recentTimestamps.push(now);
  
  // Update store
  rateLimitStore.set(key, recentTimestamps);
  
  // Only log rate limit status when approaching the limit (75% or more)
  const approachingLimit = recentTimestamps.length >= Math.ceil(limit * 0.75);
  if (approachingLimit) {
    console.log(`[Rate Limit] Approaching limit for key: ${key}. ` +
      `${recentTimestamps.length}/${limit} requests in last ${windowSeconds}s.`);
  }
  
  return false; // Not rate limited
} 