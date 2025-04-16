import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository'; // Keep sessionRepository import
import { setupDatabase } from '@/lib/db/setup'; // Keep setupDatabase import

setupDatabase(); // Ensure DB is set up

// GET /api/project-settings?projectDirectory=...&outputFormat=...
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory'); 
  
  if (!projectDirectory) { // Removed outputFormat check
    return NextResponse.json({ error: 'Missing required parameter: projectDirectory' }, { status: 400 }); // Updated error message
  }
  
  try {
    const activeSessionId = await sessionRepository.getActiveSessionId(projectDirectory);
    return NextResponse.json({ activeSessionId });
  } catch (error: unknown) { // Use unknown type for catch block variable
    console.error('Error fetching active session ID:', error);
    return NextResponse.json({ error: 'Failed to fetch active session ID' }, { status: 500 });
  }
}

// POST /api/project-settings
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { projectDirectory, sessionId } = data; // Removed outputFormat
    
    if (!projectDirectory) { // Removed outputFormat check
      return NextResponse.json({ error: 'Missing required parameter: projectDirectory' }, { status: 400 }); // Updated error message
    }
    
    // Validate sessionId type if present
    if (sessionId !== undefined && sessionId !== null && typeof sessionId !== 'string') { // Keep validation
       return NextResponse.json({ error: 'Invalid sessionId type' }, { status: 400 });
    }
     
    // Allow sessionId to be null to clear active session
    const effectiveSessionId = (sessionId === undefined || sessionId === '' || sessionId === null) ? null : sessionId;
    await sessionRepository.setActiveSession(projectDirectory, effectiveSessionId);
    return NextResponse.json({ success: true }); // Return success status
  } catch (error: unknown) { // Use unknown type for catch block variable
    console.error('Error setting active session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to set active session';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
