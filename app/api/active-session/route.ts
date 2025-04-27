import { NextRequest, NextResponse } from 'next/server';
import { getActiveSessionId, setActiveSession } from '@/lib/db';
import { setupDatabase } from '@/lib/db';

await setupDatabase(); // Ensure DB is set up

// Add rate limiting for active session requests
const activeSessionRequests = new Map<string, number>();
const REQUEST_COOLDOWN = 1000; // 1 second cooldown (reduced from 5 seconds)

// Helper function to check rate limiting
function isRateLimited(projectDirectory: string): boolean {
  const now = Date.now();
  const lastRequest = activeSessionRequests.get(projectDirectory) || 0;
  const timeSinceLastRequest = now - lastRequest;
  
  if (timeSinceLastRequest < REQUEST_COOLDOWN) {
    console.log(`[API active-session] Rate limiting request for project: ${projectDirectory} (${timeSinceLastRequest}ms since last request)`);
    return true;
  }
  
  // Update last request time
  activeSessionRequests.set(projectDirectory, now);
  
  // Clean up old entries periodically
  if (activeSessionRequests.size > 100) {
    for (const [key, timestamp] of activeSessionRequests.entries()) {
      if (now - timestamp > 60000) { // 1 minute
        activeSessionRequests.delete(key);
      }
    }
  }
  
  return false;
}

// GET /api/active-session?projectDirectory=...
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory');

  if (!projectDirectory) {
    return NextResponse.json({ error: 'Missing required parameter: projectDirectory' }, { status: 400 });
  }
  
  // Check rate limiting
  if (isRateLimited(projectDirectory)) {
    // Return success instead of error with rate limit indicator
    // This prevents errors in the UI while still enforcing rate limits
    return NextResponse.json({ sessionId: null, rateLimited: true }, { status: 200 });
  }
  
  try {
    console.log(`[API GET /active-session] Fetching active session for: ${projectDirectory}`);
    const sessionId = await getActiveSessionId(projectDirectory);
    return NextResponse.json({ sessionId });
  } catch (error: unknown) {
    console.error('Error fetching active session ID:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch active session ID';
    return NextResponse.json({ error: errorMessage, sessionId: null }, { status: 500 });
  }
}

// POST /api/active-session
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { projectDirectory, sessionId } = data;

    if (!projectDirectory) {
      return NextResponse.json({ error: 'Missing required parameter: projectDirectory' }, { status: 400 });
    }
    
    // Check rate limiting
    if (isRateLimited(projectDirectory)) {
      // Return success instead of error with rate limit indicator
      // This prevents errors in the UI while still enforcing rate limits
      return NextResponse.json({ success: true, rateLimited: true }, { status: 200 });
    }

    // Validate sessionId type if present
    if (sessionId !== undefined && sessionId !== null && typeof sessionId !== 'string') {
       return NextResponse.json({ error: 'Invalid sessionId type' }, { status: 400 });
    }
     
    // Allow sessionId to be null to clear active session
    const effectiveSessionId = (sessionId === undefined || sessionId === '') ? null : sessionId;
    console.log(`[API POST /active-session] Setting active session for project '${projectDirectory}' to: ${effectiveSessionId === null ? 'null' : effectiveSessionId}`);
    await setActiveSession(projectDirectory, effectiveSessionId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error setting active session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to set active session';
    // Still return 200 to prevent UI errors
    return NextResponse.json({ success: false, error: errorMessage }, { status: 200 });
  }
} 