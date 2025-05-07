import { getActiveSessionId, setActiveSession } from '@/lib/db';
import { setupDatabase } from '@/lib/db';
import { headers } from 'next/headers';
import { rateLimitCheck } from '@/lib/rate-limit';

// Ensure DB is set up
await setupDatabase();

// GET /api/active-session?projectDirectory=...
export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectDirectory = url.searchParams.get('projectDirectory');
  
  if (!projectDirectory) {
    console.error('[API] /active-session GET: Missing projectDirectory parameter');
    return Response.json({ error: 'Missing projectDirectory parameter' }, { status: 400 });
  }
  
  // Log request details
  console.log(`[API] /active-session GET request for project: ${projectDirectory}`);
  
  // Rate limit check
  const clientIp = (await headers()).get('x-forwarded-for') || 'unknown';
  const rateLimitKey = `active-session:get:${clientIp}:${projectDirectory}`;
  
  // Check if rate limited
  const isRateLimited = await rateLimitCheck(rateLimitKey, 15, 30); // 15 requests per 30 seconds - relaxed rate limit
  
  if (isRateLimited) {
    console.warn(`[API] /active-session GET: Rate limit exceeded for project: ${projectDirectory}, IP: ${clientIp}`);
    return Response.json(
      { 
        error: 'Too many requests. Please try again later.',
        rateLimited: true,
        sessionId: null
      }, 
      { status: 429 }
    );
  }
  
  try {
    // Get active session from database
    const sessionId = await getActiveSessionId(projectDirectory);
    console.log(`[API] /active-session GET: Active session for project ${projectDirectory}: ${sessionId || 'null'}`);
    
    return Response.json({ 
      sessionId,
      projectDirectory
    });
  } catch (error) {
    console.error(`[API] /active-session GET: Error fetching active session for project: ${projectDirectory}:`, error);
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId: null
    }, { status: 500 });
  }
}

// POST /api/active-session
export async function POST(req: Request) {
  try {
    const startTime = Date.now();
    
    const { projectDirectory, sessionId } = await req.json();
    
    if (!projectDirectory) {
      console.error('[API] /active-session POST: Missing projectDirectory parameter');
      return Response.json({ error: 'Missing projectDirectory parameter' }, { status: 400 });
    }
    
    // Add validation for sessionId when present
    if (sessionId !== null && (typeof sessionId !== 'string' || !sessionId.trim())) {
      console.error('[API] /active-session POST: Invalid sessionId format or type:', {
        value: sessionId,
        type: typeof sessionId
      });
      return Response.json(
        { error: 'Invalid session ID format', success: false },
        { status: 400 }
      );
    }
    
    // Enhanced logging for debugging
    console.log(`[API] /active-session POST: Setting active session for project: ${projectDirectory} to: ${sessionId || 'null'}`);
    
    // Rate limit check
    const headersList = await headers();
    const clientIp = headersList.get('x-forwarded-for') || 'unknown';
    const rateLimitKey = `active-session:post:${clientIp}:${projectDirectory}`;
    
    // Check if rate limited (write operations with relaxed limits)
    const isRateLimited = await rateLimitCheck(rateLimitKey, 10, 30); // 10 requests per 30 seconds
    
    if (isRateLimited) {
      console.warn(`[API] /active-session POST: Rate limit exceeded for project: ${projectDirectory}, IP: ${clientIp}`);
      
      return Response.json(
        { 
          error: 'Too many requests. Please try again later.',
          rateLimited: true
        }, 
        { status: 429 }
      );
    }
    
    // Set active session in database
    await setActiveSession(projectDirectory, sessionId);
    
    const totalDuration = Date.now() - startTime;
    console.log(`[API] /active-session POST: Successfully set active session for project: ${projectDirectory} (${totalDuration}ms)`);
    
    return Response.json({ 
      success: true,
      projectDirectory,
      sessionId
    });
  } catch (error) {
    console.error('[API] /active-session POST: Error setting active session:', error);
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 