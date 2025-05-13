/**
 * API Rate Limiter Middleware
 * 
 * A reusable middleware for handling rate limiting across different API routes.
 * Provides configurable rate limiting with client tracking, global limits, and
 * custom cooling periods for different types of requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Interface for tracking client request patterns
 */
interface RequestPattern {
  key: string;
  projectDir: string | null;
  totalRequests: number;
  postRequests: number;
  getRequests: number;
  firstRequest: number;
  lastRequest: number;
  userAgents: Set<string>;
  referers: Set<string>;
}

/**
 * Interface for client request statistics
 */
interface ClientStats {
  count: number;
  firstRequest: number;
}

/**
 * Global rate limit configuration
 */
interface GlobalRateLimit {
  requestsPerMinute: number;
  trackingWindow: number;
  requests: number[];
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  standardCooldown: number;
  criticalKeyCooldown: number;
  abusiveRequestsPerMinute: number;
  enableGlobalRateLimit?: boolean;
  globalRequestsPerMinute?: number;
  criticalKeys?: string[];
  allowCriticalWhenOverGlobalLimit?: boolean;
  requestMap: Map<string, number>;
  requestCounts: Map<string, ClientStats>;
  requestPatterns: Map<string, RequestPattern>;
  globalRateLimit?: GlobalRateLimit;
}

/**
 * Get client ID from request
 * This generates a consistent identifier for a client based on IP and user agent
 */
export function getClientId(req: NextRequest): string {
  const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
  const userAgent = req.headers.get('user-agent') || 'unknown-agent';
  
  // Create a hash of IP + user agent for tracking without storing PII directly
  return crypto.createHash('sha256')
    .update(`${ip}:${userAgent}`)
    .digest('hex')
    .substring(0, 16); // Use just first 16 chars of hash
}

/**
 * Get project directory from request
 * Extracts from query parameters or body based on method
 */
export function getProjectDir(req: NextRequest): string | null {
  // For GET requests, check query parameters
  if (req.method === 'GET') {
    const url = new URL(req.url);
    return url.searchParams.get('projectDirectory');
  }
  
  // For POST requests, try to extract from the request body
  if (req.method === 'POST') {
    try {
      // Clone the request to avoid consuming the body
      const clonedReq = req.clone();
      // This is an async operation, so we can't use it directly
      // We'll have to rely on the request handler to extract this
      return null;
    } catch (e) {
      return null;
    }
  }
  
  return null;
}

/**
 * Handle rate limiting for an API request
 * 
 * @param req The Next.js request object
 * @param key The cache key for rate limiting
 * @param projectDirectory Optional project directory
 * @param config Rate limiter configuration
 * @returns Object indicating if the request is rate limited and optional response
 */
export function handleRateLimit(
  req: NextRequest,
  key: string,
  projectDirectory: string | null,
  config: RateLimiterConfig
): { isRateLimited: boolean; response?: NextResponse } {
  const clientId = getClientId(req);
  const now = Date.now();
  const cacheKey = `${projectDirectory || 'global'}:${key}`;
  const method = req.method;
  
  // Apply global rate limiting if enabled
  if (config.enableGlobalRateLimit && config.globalRateLimit) {
    const { globalRateLimit } = config;
    
    // Filter out old requests
    const recentRequests = globalRateLimit.requests.filter(
      timestamp => now - timestamp < globalRateLimit.trackingWindow
    );
    globalRateLimit.requests = recentRequests;
    
    // Add current request to tracking
    globalRateLimit.requests.push(now);
    
    // Check if we're over the global limit
    if (globalRateLimit.requests.length > globalRateLimit.requestsPerMinute) {
      console.warn(`[API] Global rate limit exceeded: ${globalRateLimit.requests.length} requests in the last minute`);
      console.warn(`[API] Request: ${key} from client ${clientId} for project ${projectDirectory || 'global'}`);
      
      // Allow critical keys through if configured
      const criticalKeys = config.criticalKeys || [];
      const isCriticalKey = criticalKeys.some(criticalKey => key === criticalKey || key.includes(criticalKey));
      
      if (isCriticalKey && config.allowCriticalWhenOverGlobalLimit) {
        console.log(`[API] Allowing critical key "${key}" despite global rate limit`);
      } else {
        return {
          isRateLimited: true,
          response: NextResponse.json(
            { error: 'Too many requests, please try again later' },
            { status: 429 }
          )
        };
      }
    }
  }
  
  // Track last request time for this key + project combo
  const lastRequest = config.requestMap.get(cacheKey) || 0;
  const timeSinceLastRequest = now - lastRequest;
  
  // Check if this is a critical key that gets a longer cooldown
  const criticalKeys = config.criticalKeys || [];
  const isCriticalKey = criticalKeys.some(criticalKey => key === criticalKey || key.includes(criticalKey));
  
  // Apply appropriate cooldown period
  const effectiveCooldown = isCriticalKey
    ? config.criticalKeyCooldown
    : config.standardCooldown;
  
  // Check if we're within the cooldown period
  if (timeSinceLastRequest < effectiveCooldown) {
    return {
      isRateLimited: true,
      response: NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((effectiveCooldown - timeSinceLastRequest) / 1000)
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil((effectiveCooldown - timeSinceLastRequest) / 1000).toString()
          }
        }
      )
    };
  }
  
  // Update last request time for this key
  config.requestMap.set(cacheKey, now);
  
  // Track client-specific request patterns
  if (!config.requestCounts.has(clientId)) {
    config.requestCounts.set(clientId, { count: 1, firstRequest: now });
  } else {
    const clientStats = config.requestCounts.get(clientId)!;
    clientStats.count++;
    
    // Check for potential abuse
    const requestsPerMinute = clientStats.count / ((now - clientStats.firstRequest) / 60000);
    if (requestsPerMinute > config.abusiveRequestsPerMinute) {
      console.warn(`[API] Potentially abusive client detected: ${clientId} with ${requestsPerMinute.toFixed(2)} req/min`);
      // Reset the counter after logging abuse
      config.requestCounts.set(clientId, { count: 0, firstRequest: now });
      return {
        isRateLimited: true,
        response: NextResponse.json(
          { error: 'Too many requests, please try again later' },
          { status: 429 }
        )
      };
    }
    
    // Reset counter every 5 minutes
    if (now - clientStats.firstRequest > 300000) {
      config.requestCounts.set(clientId, { count: 1, firstRequest: now });
    }
  }
  
  // Track patterns for this key and project
  const patternKey = `${key}:${projectDirectory || 'global'}`;
  if (!config.requestPatterns.has(patternKey)) {
    config.requestPatterns.set(patternKey, {
      key,
      projectDir: projectDirectory,
      totalRequests: 1,
      postRequests: method === 'POST' ? 1 : 0,
      getRequests: method === 'GET' ? 1 : 0,
      firstRequest: now,
      lastRequest: now,
      userAgents: new Set([req.headers.get('user-agent') || 'unknown']),
      referers: new Set([req.headers.get('referer') || 'unknown'])
    });
  } else {
    const pattern = config.requestPatterns.get(patternKey)!;
    pattern.totalRequests++;
    if (method === 'POST') pattern.postRequests++;
    if (method === 'GET') pattern.getRequests++;
    pattern.lastRequest = now;
    pattern.userAgents.add(req.headers.get('user-agent') || 'unknown');
    pattern.referers.add(req.headers.get('referer') || 'unknown');
    
    // Log potentially problematic patterns every 10 requests
    if (pattern.totalRequests % 10 === 0) {
      const timeSpan = (now - pattern.firstRequest) / 1000;
      const reqPerSec = pattern.totalRequests / timeSpan;
      
      if (reqPerSec > 1.0) { // More than 1 request per second on average
        console.warn(`[API] High frequency access pattern detected:`);
        console.warn(`Key: ${key}, Project: ${projectDirectory || 'global'}, Frequency: ${reqPerSec.toFixed(2)} req/sec`);
        console.warn(`Total: ${pattern.totalRequests}, POST: ${pattern.postRequests}, GET: ${pattern.getRequests}`);
      }
    }
  }
  
  // Not rate limited
  return { isRateLimited: false };
}

/**
 * Create a default rate limiter configuration
 */
export function createDefaultRateLimiterConfig(): RateLimiterConfig {
  return {
    standardCooldown: 5000, // 5 seconds
    criticalKeyCooldown: 15000, // 15 seconds
    abusiveRequestsPerMinute: 50,
    enableGlobalRateLimit: true,
    globalRequestsPerMinute: 120,
    criticalKeys: ['global-project-dir', 'project-directory', 'activeSessionId'],
    allowCriticalWhenOverGlobalLimit: true,
    requestMap: new Map<string, number>(),
    requestCounts: new Map<string, ClientStats>(),
    requestPatterns: new Map<string, RequestPattern>(),
    globalRateLimit: {
      requestsPerMinute: 120,
      trackingWindow: 60000, // 1 minute
      requests: []
    }
  };
}