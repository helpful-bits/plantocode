import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository';
import { setupDatabase } from '@/lib/db/setup';
import { OutputFormat } from '@/types';

// Initialize database on server startup
setupDatabase();

// GET /api/sessions?projectDirectory=...&outputFormat=...
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory');
  const outputFormat = searchParams.get('outputFormat') as OutputFormat;
  
  if (!projectDirectory || !outputFormat) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }
  
  try {
    const sessions = await sessionRepository.getSessions(projectDirectory, outputFormat);
    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

// POST /api/sessions
export async function POST(request: NextRequest) {
  try {
    const session = await request.json();
    const savedSession = await sessionRepository.saveSession(session);
    return NextResponse.json(savedSession);
  } catch (error) {
    console.error('Error saving session:', error);
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 });
  }
}

// DELETE /api/sessions/:id
export async function DELETE(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('id');
  
  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }
  
  try {
    await sessionRepository.deleteSession(sessionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
} 