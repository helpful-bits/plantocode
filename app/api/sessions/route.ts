import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository'; // Keep sessionRepository import
import { setupDatabase } from '@/lib/db/setup'; // Keep setupDatabase import
import { Session } from '@/types'; // Removed OutputFormat

setupDatabase(); // Ensure database is initialized 

// GET /api/sessions?projectDirectory=...&outputFormat=...
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory'); 
  
  if (!projectDirectory) { // Removed outputFormat check
    return NextResponse.json({ error: 'Missing required parameter: projectDirectory' }, { status: 400 }); // Updated error message
  }
  
  try {
    const sessions = await sessionRepository.getSessions(projectDirectory);
    return NextResponse.json(sessions);
  } catch (error: unknown) { // Use unknown type for catch block variable
    console.error('Error fetching sessions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch sessions';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// POST /api/sessions
export async function POST(request: NextRequest) {
  try {
    const sessionData = await request.json();
     
    // Basic validation - removed outputFormat check
    if (!sessionData.id || !sessionData.name || !sessionData.projectDirectory) {
       return NextResponse.json({ error: 'Missing required session fields' }, { status: 400 });
    }
    
    // Add/update timestamp before saving
    const session = { ...sessionData, updatedAt: Date.now() };
    
    console.log(`API: Saving session ${session.id} for project ${session.projectDirectory}`);
    const savedSession = await sessionRepository.saveSession(session);
    return NextResponse.json(savedSession);
  } catch (error: unknown) { // Use unknown type for catch block variable
    console.error('Error saving session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to save session';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// DELETE /api/sessions?id=...
export async function DELETE(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('id');
  
  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }
  
  try {
    await sessionRepository.deleteSession(sessionId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) { // Use unknown type for catch block variable
    console.error('Error deleting session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete session';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
