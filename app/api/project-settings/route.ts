import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository';
import { setupDatabase } from '@/lib/db/setup';
import { OutputFormat } from '@/types';

setupDatabase();

// GET /api/project-settings?projectDirectory=...&outputFormat=...
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory');
  const outputFormat = searchParams.get('outputFormat') as OutputFormat;
  
  if (!projectDirectory || !outputFormat) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }
  
  try {
    const activeSessionId = await sessionRepository.getActiveSessionId(projectDirectory, outputFormat);
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
    const { projectDirectory, outputFormat, sessionId } = data;
    
    if (!projectDirectory || !outputFormat) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    // Validate sessionId type if present
    if (sessionId !== undefined && sessionId !== null && typeof sessionId !== 'string') {
       return NextResponse.json({ error: 'Invalid sessionId type' }, { status: 400 });
    }
    
    // sessionId can be null to clear the active session
    const effectiveSessionId = (sessionId === undefined || sessionId === '' || sessionId === null) ? null : sessionId;
    await sessionRepository.setActiveSession(projectDirectory, outputFormat, effectiveSessionId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) { // Use unknown type for catch block variable
    console.error('Error setting active session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to set active session';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 

