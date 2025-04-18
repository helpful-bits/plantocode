import { NextRequest, NextResponse } from 'next/server';
import { getActiveSessionId, setActiveSession } from '@/lib/db';
import { setupDatabase } from '@/lib/db';

await setupDatabase(); // Ensure DB is set up

// GET /api/active-session?projectDirectory=...
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory');

  if (!projectDirectory) {
    return NextResponse.json({ error: 'Missing required parameter: projectDirectory' }, { status: 400 });
  }
  
  try {
    console.log(`[API GET /active-session] Fetching active session for: ${projectDirectory}`);
    const sessionId = await getActiveSessionId(projectDirectory);
    return NextResponse.json({ sessionId });
  } catch (error: unknown) {
    console.error('Error fetching active session ID:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch active session ID';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
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
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 