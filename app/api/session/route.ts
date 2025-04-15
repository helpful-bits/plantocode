import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository'; // Keep sessionRepository import
import { setupDatabase } from '@/lib/db/setup';
import { Session } from '@/types';
// GET /api/session?id=...
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('id');
  
  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }
  
  await setupDatabase();
  
  try {
    const session = await sessionRepository.getSession(sessionId);
    
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    
    return NextResponse.json(session);
  } catch (error: unknown) { // Use unknown type for catch block variable
    console.error('Error fetching session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch session';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
