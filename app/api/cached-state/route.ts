import { NextRequest, NextResponse } from 'next/server';
import { getCachedState, saveCachedState } from '@/lib/db';
import crypto from 'crypto';

// Add rate limiting for cached state requests
const cachedStateRequests = new Map<string, number>();
// Track frequency of requests per client
const requestCounts = new Map<string, { count: number, firstRequest: number }>();
const REQUEST_COOLDOWN = 8000; // 8 second cooldown (increased from 3 seconds)
const PROJECT_DIR_COOLDOWN = 15000; // 15 second cooldown for project directory changes (increased from 5s)

// Track request patterns to identify potentially problematic API usage
const requestPatterns = new Map<string, {
  key: string,
  projectDir: string | null,
  totalRequests: number,
  postRequests: number,
  getRequests: number,
  firstRequest: number,
  lastRequest: number,
  userAgents: Set<string>,
  referers: Set<string>
}>();

// Helper function to check rate limiting
function isRateLimited(key: string, projectDirectory: string | null, clientId: string = 'unknown'): boolean {
  const cacheKey = `${projectDirectory || 'global'}:${key}`;
  const now = Date.now();
  const lastRequest = cachedStateRequests.get(cacheKey) || 0;
  const timeSinceLastRequest = now - lastRequest;
  
  // More aggressive rate limiting for project directory and session keys
  const effectiveCooldown = (key === 'global-project-dir' || key === 'project-directory' || key.includes('activeSessionId')) 
    ? PROJECT_DIR_COOLDOWN
    : REQUEST_COOLDOWN;
  
  // Track client-specific request patterns
  if (!requestCounts.has(clientId)) {
    requestCounts.set(clientId, { count: 1, firstRequest: now });
  } else {
    const clientStats = requestCounts.get(clientId)!;
    clientStats.count++;
    
    // Check for potential abuse - if more than 50 requests in a minute, increase the cooldown
    const requestsPerMinute = clientStats.count / ((now - clientStats.firstRequest) / 60000);
    if (requestsPerMinute > 50) {
      console.warn(`[API cached-state] Potentially abusive client detected: ${clientId} with ${requestsPerMinute.toFixed(2)} req/min`);
      // Reset the counter after logging abuse
      requestCounts.set(clientId, { count: 0, firstRequest: now });
      return true;
    }
    
    // Reset counter every 5 minutes
    if (now - clientStats.firstRequest > 300000) {
      requestCounts.set(clientId, { count: 1, firstRequest: now });
    }
  }
  
  // Track patterns for this key and project
  const patternKey = `${key}:${projectDirectory || 'global'}`;
  if (!requestPatterns.has(patternKey)) {
    requestPatterns.set(patternKey, {
      key,
      projectDir: projectDirectory,
      totalRequests: 1,
      postRequests: 0,
      getRequests: 0,
      firstRequest: now,
      lastRequest: now,
      userAgents: new Set(),
      referers: new Set()
    });
  } else {
    const pattern = requestPatterns.get(patternKey)!;
    pattern.totalRequests++;
    pattern.lastRequest = now;
    
    // Log potentially problematic patterns every 10 requests
    if (pattern.totalRequests % 10 === 0) {
      const timeSpan = (now - pattern.firstRequest) / 1000;
      const requestsPerMinute = (pattern.totalRequests / timeSpan) * 60;
      
      if (requestsPerMinute > 10) {
        console.warn(`[API cached-state] High frequency access detected for key "${key}" (project: ${projectDirectory || 'global'}):`);
        console.warn(`  - ${pattern.totalRequests} total requests in ${timeSpan.toFixed(1)}s (${requestsPerMinute.toFixed(1)} req/min)`);
        console.warn(`  - POST: ${pattern.postRequests}, GET: ${pattern.getRequests}`);
        console.warn(`  - User agents: ${Array.from(pattern.userAgents).join(', ')}`);
        console.warn(`  - Referers: ${Array.from(pattern.referers).join(', ')}`);
      }
      
      // Reset data after 10 minutes to avoid stale patterns
      if (now - pattern.firstRequest > 600000) {
        pattern.totalRequests = 1;
        pattern.firstRequest = now;
        pattern.postRequests = 0;
        pattern.getRequests = 0;
      }
    }
  }
  
  if (timeSinceLastRequest < effectiveCooldown) {
    console.log(`[API cached-state] Rate limiting request for ${key} in ${projectDirectory || 'global'} (${timeSinceLastRequest}ms since last request, cooldown: ${effectiveCooldown}ms, cooldown type: ${effectiveCooldown === PROJECT_DIR_COOLDOWN ? 'project directory' : 'standard'}, client: ${clientId})`);
    return true;
  }
  
  // Update last request time
  cachedStateRequests.set(cacheKey, now);
  
  // Clean up old entries periodically
  if (cachedStateRequests.size > 100) {
    const deleteThreshold = now - 300000; // 5 minutes
    for (const [mapKey, timestamp] of cachedStateRequests.entries()) {
      if (timestamp < deleteThreshold) {
        cachedStateRequests.delete(mapKey);
      }
    }
  }
  
  return false;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory');
  const key = searchParams.get('key');
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  const referer = request.headers.get('referer') || 'unknown';
  const clientId = crypto.createHash('sha256').update(clientIp + userAgent).digest('hex').substring(0, 8);
  const timestamp = new Date().toISOString();

  if (!key) {
    console.error(`[API cached-state][${timestamp}] Missing key parameter from client ${clientId}`);
    return NextResponse.json({ error: 'Missing required parameter: key' }, { status: 400 });
  }

  // Log GET request details
  console.log(`[API cached-state][${timestamp}] GET request details:
    - Key: ${key}
    - Project directory: ${projectDirectory || 'global'}
    - Client IP (hashed): ${clientId}
    - User-Agent: ${userAgent}
    - Referer: ${referer}
  `);
  
  // Update request pattern tracking
  const patternKey = `${key}:${projectDirectory || 'global'}`;
  if (requestPatterns.has(patternKey)) {
    const pattern = requestPatterns.get(patternKey)!;
    pattern.getRequests++;
    pattern.userAgents.add(userAgent);
    pattern.referers.add(referer);
  }

  // Check rate limiting - use null for projectDirectory when it's not provided
  const projectDirForRateLimit = projectDirectory || 'global';
  if (isRateLimited(key, projectDirForRateLimit, clientId)) {
    console.warn(`[API cached-state][${timestamp}] Rate limited GET request:
      - Key: ${key}
      - Project: ${projectDirectory || 'global'}
      - Client: ${clientId}
      - Referer: ${referer}
    `);
    
    // For project directory requests, return cached empty value instead of error
    if (key === 'global-project-dir' || key === 'project-directory' || key.includes('activeSessionId')) {
      return NextResponse.json({ value: null, rateLimited: true, details: `Request too soon after previous request` });
    }
    return NextResponse.json({ value: null, rateLimited: true, details: `Request too soon after previous request` }, { status: 429 });
  }

  try {
    const value = await getCachedState(projectDirectory, key);
    return NextResponse.json({ value });
  } catch (error) {
    console.error(`[API cached-state][${timestamp}] Error fetching cached state:`, error);
    return NextResponse.json({ error: 'Failed to fetch cached state' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const referer = request.headers.get('referer') || 'unknown';
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
    const timestamp = new Date().toISOString();
    
    // Generate a client ID for request tracking - hash the IP to maintain privacy
    const clientId = crypto.createHash('sha256').update(clientIp + userAgent).digest('hex').substring(0, 8);
    
    if (!contentType || !contentType.includes('application/json')) {
      console.error(`[API cached-state][${timestamp}] Invalid content type: ${contentType} from client ${clientId}`);
      return NextResponse.json(
        { error: 'Content-Type must be application/json' }, 
        { status: 400 }
      );
    }
    
    let requestData;
    try {
      requestData = await request.json();
    } catch (parseError) {
      console.error(`[API cached-state][${timestamp}] Error parsing JSON request body from client ${clientId}:`, parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' }, 
        { status: 400 }
      );
    }
    
    const { projectDirectory, key, value } = requestData;
    const valueString = typeof value === 'object' ? JSON.stringify(value).substring(0, 100) + '...' : String(value);
    const valueLength = value ? String(value).length : 0;
    
    // Update request pattern tracking for POST
    const patternKey = `${key}:${projectDirectory || 'global'}`;
    if (requestPatterns.has(patternKey)) {
      const pattern = requestPatterns.get(patternKey)!;
      pattern.postRequests++;
      pattern.userAgents.add(userAgent);
      pattern.referers.add(referer);
    } else {
      // If this is the first request for this key, initialize tracking
      const now = Date.now();
      requestPatterns.set(patternKey, {
        key,
        projectDir: projectDirectory,
        totalRequests: 1,
        postRequests: 1,
        getRequests: 0,
        firstRequest: now,
        lastRequest: now,
        userAgents: new Set([userAgent]),
        referers: new Set([referer])
      });
    }
    
    // Add extended request headers logging to find the source of excessive calls
    const headers = Object.fromEntries([...request.headers.entries()]);
    const headersJson = JSON.stringify(headers);
    
    // Enhanced detailed logging to track what's making the frequent cached-state requests
    console.log(`[API cached-state][${timestamp}] POST request details:
      - Key: ${key}
      - Project directory: ${projectDirectory || 'global'}
      - Value type: ${typeof value}
      - Value length: ${valueLength}
      - Value preview: ${valueLength > 100 ? valueString.substring(0, 100) + '...' : valueString}
      - User-Agent: ${userAgent}
      - Referer: ${referer}
      - Client IP (hashed): ${clientId}
      - Request headers: ${headersJson.substring(0, 200)}...
    `);

    if (key === undefined) {
      console.error(`[API cached-state][${timestamp}] Missing key parameter from client ${clientId}`);
      return NextResponse.json(
        { error: 'Missing required parameter: key' }, 
        { status: 400 }
      );
    }

    // Check rate limiting for POST
    const projectDirForRateLimit = projectDirectory || 'global';
    if (isRateLimited(key, projectDirForRateLimit, clientId)) {
      console.warn(`[API cached-state][${timestamp}] Rate limited POST request:
        - Key: ${key}
        - Project: ${projectDirectory || 'global'}
        - Client: ${clientId}
        - Value length: ${valueLength}
        - Referer: ${referer}
        - Stack trace: ${headers['x-stack-trace'] || 'not available'}
      `);
      
      // For critical keys, return success to reduce retries
      if (key === 'global-project-dir' || key === 'project-directory' || key.includes('activeSessionId')) {
        return NextResponse.json({ success: true, rateLimited: true, details: `Request too soon after previous request` });
      }
      return NextResponse.json({ success: false, rateLimited: true, details: `Request too soon after previous request` }, { status: 429 });
    }

    // Ensure value is a string
    const safeValue = value === undefined || value === null ? "" : String(value);
    
    await saveCachedState(projectDirectory, key, safeValue);
    
    // Log successful saves
    console.log(`[API cached-state][${timestamp}] Successfully saved state for key: ${key}, project: ${projectDirectory || 'global'}, client: ${clientId}`);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[API cached-state][${timestamp}] Error saving cached state:`, error);
    
    let errorMessage = 'Failed to save cached state';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { error: errorMessage }, 
      { status: 500 }
    );
  }
}