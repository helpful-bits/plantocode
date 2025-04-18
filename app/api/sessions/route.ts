import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository, getSessions, deleteSession, setupDatabase } from '@/lib/db'; // Import deleteSession
import { Session } from '@/types'; // Keep Session import

setupDatabase(); // Ensure database is initialized 

// GET /api/sessions?projectDirectory=...&outputFormat=...
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory'); 

  if (!projectDirectory) {
    return NextResponse.json({ error: 'Missing required parameter: projectDirectory' }, { status: 400 });
  }

  try {
    const sessions = await getSessions(projectDirectory);
    return NextResponse.json(sessions);
  } catch (error: unknown) {
    console.error('Error fetching sessions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch sessions';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// POST /api/sessions
export async function POST(request: NextRequest) {
  try {
    const sessionData = await request.json();

    // Basic validation - removed outputFormat field check
    if (!sessionData.id || !sessionData.name || !sessionData.projectDirectory) {
       return NextResponse.json({ error: 'Missing required session fields' }, { status: 400 });
    }
    
    // Add/update timestamp before saving
    const session = { ...sessionData, updatedAt: Date.now() };
    
    console.log(`API: Saving session ${session.id} for project ${session.projectDirectory}`);
    const savedSession = await sessionRepository.saveSession(session); // Keep saveSession call
    return NextResponse.json(savedSession);
  } catch (error: unknown) {
    console.error('Error saving session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to save session';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// DELETE /api/sessions?id=...
export async function DELETE(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('id');

  if (!sessionId) { // Keep check for sessionId
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }

  try {
    await deleteSession(sessionId); // Use the deleteSession function
    return NextResponse.json({ success: true }); // Keep success response
  } catch (error: unknown) { // Use unknown type for catch block variable
    console.error('Error deleting session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete session';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
