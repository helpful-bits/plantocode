import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository';
import { OutputFormat } from '@/types';

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
  } catch (error) {
    console.error('Error fetching active session ID:', error);
    return NextResponse.json({ error: 'Failed to fetch active session ID' }, { status: 500 });
  }
}

// POST /api/project-settings
export async function POST(request: NextRequest) {
  try {
    const { projectDirectory, outputFormat, sessionId } = await request.json();
    
    if (!projectDirectory || !outputFormat) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    await sessionRepository.setActiveSession(projectDirectory, outputFormat, sessionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error setting active session:', error);
    return NextResponse.json({ error: 'Failed to set active session' }, { status: 500 });
  }
} 