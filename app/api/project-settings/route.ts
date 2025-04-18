import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository'; // Keep sessionRepository import
import { setupDatabase } from '@/lib/db/setup'; // Keep setupDatabase import
 
setupDatabase(); // Ensure DB is set up

// GET /api/project-settings?projectDirectory=...&outputFormat=...
export async function GET(request: NextRequest) { // Keep function signature
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory'); 

  if (!projectDirectory) {
    return NextResponse.json({ error: 'Missing required parameter: projectDirectory' }, { status: 400 });
  }
  
  try {
    console.log(`[API GET /project-settings] Fetching active session for: ${projectDirectory}`);
    const activeSessionId = await sessionRepository.getActiveSessionId(projectDirectory);
    return NextResponse.json({ activeSessionId });
  } catch (error: unknown) { // Use unknown type for catch block variable
    console.error('Error fetching active session ID:', error);
    return NextResponse.json({ error: 'Failed to fetch active session ID' }, { status: 500 });
  }
} // Close GET function

// POST /api/project-settings
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { projectDirectory, sessionId } = data;

    if (!projectDirectory) {
      return NextResponse.json({ error: 'Missing required parameter: projectDirectory' }, { status: 400 });
    }

    // Validate sessionId type if present
    if (sessionId !== undefined && sessionId !== null && typeof sessionId !== 'string') { // Keep validation
       return NextResponse.json({ error: 'Invalid sessionId type' }, { status: 400 });
    }
     
    // Allow sessionId to be null to clear active session
    const effectiveSessionId = (sessionId === undefined || sessionId === '') ? null : sessionId; // Allow null explicitly
    console.log(`[API POST /project-settings] Setting active session for project '${projectDirectory}' to: ${effectiveSessionId === null ? 'null' : effectiveSessionId}`);
    await sessionRepository.setActiveSession(projectDirectory, effectiveSessionId); // Removed outputFormat
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error setting active session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to set active session';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
