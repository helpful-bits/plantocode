import { NextRequest, NextResponse } from 'next/server';
import { ensureConnection, setupDatabase } from '@/lib/db';
import crypto from 'crypto';

setupDatabase();

// Add rate limiting for cached state requests
const cachedStateRequests = new Map<string, number>();
const REQUEST_COOLDOWN = 5000; // 5 second cooldown

// Helper function to check rate limiting
function isRateLimited(key: string, projectDirectory: string | null): boolean {
  const cacheKey = `${projectDirectory || 'global'}:${key}`;
  const now = Date.now();
  const lastRequest = cachedStateRequests.get(cacheKey) || 0;
  const timeSinceLastRequest = now - lastRequest;
  
  // Super aggressive rate limiting for global-project-dir
  const effectiveCooldown = (key === 'global-project-dir' || key === 'project-directory') 
    ? 10000  // 10 seconds for project directory
    : REQUEST_COOLDOWN;
  
  if (timeSinceLastRequest < effectiveCooldown) {
    console.log(`[API cached-state] Rate limiting request for ${key} in ${projectDirectory || 'global'} (${timeSinceLastRequest}ms since last request)`);
    return true;
  }
  
  // Update last request time
  cachedStateRequests.set(cacheKey, now);
  
  // Clean up old entries periodically
  if (cachedStateRequests.size > 100) {
    for (const [key, timestamp] of cachedStateRequests.entries()) {
      if (now - timestamp > 60000) { // 1 minute
        cachedStateRequests.delete(key);
      }
    }
  }
  
  return false;
}

// Direct implementation of getCachedState function
async function directGetCachedState(projectDirectory: string | null, key: string): Promise<string | null> {
  try {
    const db = ensureConnection();
    
    // Hash project directory if provided, otherwise use null
    let projectHash = null;
    if (projectDirectory) {
      projectHash = crypto.createHash('md5').update(projectDirectory).digest('hex');
    }
    
    return new Promise((resolve, reject) => {
      let query, params;
      
      if (projectHash) {
        query = 'SELECT value FROM cached_state WHERE project_hash = ? AND key = ? LIMIT 1';
        params = [projectHash, key];
      } else {
        query = 'SELECT value FROM cached_state WHERE project_hash IS NULL AND key = ? LIMIT 1';
        params = [key];
      }
      
      db.get(query, params, (err, row) => {
        if (err) {
          console.error(`Database error fetching cached state for ${key}:`, err);
          reject(err);
        } else {
          resolve(row ? row.value : null);
        }
      });
    });
  } catch (error) {
    console.error(`Error in direct getCachedState for ${key}:`, error);
    return null;
  }
}

// Direct implementation of saveCachedState function
async function directSaveCachedState(projectDirectory: string | null, key: string, value: string): Promise<void> {
  try {
    const db = ensureConnection();
    
    // Hash project directory if provided, otherwise use null
    let projectHash = null;
    if (projectDirectory) {
      projectHash = crypto.createHash('md5').update(projectDirectory).digest('hex');
    }
    
    return new Promise((resolve, reject) => {
      const now = Math.floor(Date.now() / 1000); // Current time in seconds
      
      // Use REPLACE to handle both insert and update cases
      const query = `
        REPLACE INTO cached_state (project_hash, key, value, updated_at)
        VALUES (?, ?, ?, ?)
      `;
      
      db.run(query, [projectHash, key, value, now], function(err) {
        if (err) {
          console.error(`Database error saving cached state for ${key}:`, err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    console.error(`Error in direct saveCachedState for ${key}:`, error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory');
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'Missing required parameter: key' }, { status: 400 });
  }

  // Check rate limiting - use null for projectDirectory when it's not provided
  const projectDirForRateLimit = projectDirectory || 'global';
  if (isRateLimited(key, projectDirForRateLimit)) {
    // For project directory requests, return cached empty value instead of error
    if (key === 'global-project-dir' || key === 'project-directory' || key === 'active-session-id') {
      return NextResponse.json({ value: null, rateLimited: true });
    }
    return NextResponse.json({ value: null, rateLimited: true }, { status: 429 });
  }

  try {
    const value = await directGetCachedState(projectDirectory, key);
    return NextResponse.json({ value });
  } catch (error) {
    console.error('Error fetching cached state:', error);
    return NextResponse.json({ error: 'Failed to fetch cached state' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' }, 
        { status: 400 }
      );
    }
    
    let requestData;
    try {
      requestData = await request.json();
    } catch (parseError) {
      console.error('Error parsing JSON request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' }, 
        { status: 400 }
      );
    }
    
    const { projectDirectory, key, value } = requestData;

    if (key === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameter: key' }, 
        { status: 400 }
      );
    }

    // Check rate limiting for POST
    const projectDirForRateLimit = projectDirectory || 'global';
    if (isRateLimited(key, projectDirForRateLimit)) {
      // For critical keys, return success to reduce retries
      if (key === 'global-project-dir' || key === 'project-directory' || key === 'active-session-id') {
        return NextResponse.json({ success: true, rateLimited: true });
      }
      return NextResponse.json({ success: false, rateLimited: true }, { status: 429 });
    }

    // Ensure value is a string
    const safeValue = value === undefined || value === null ? "" : String(value); 
    
    await directSaveCachedState(projectDirectory, key, safeValue);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving cached state:', error);
    
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
