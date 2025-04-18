import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository'; // Keep sessionRepository import
import { setupDatabase } from '@/lib/db/setup'; // Keep setupDatabase import
import { Session } from '@/types'; // Keep Session import
// GET /api/session?id=...
// Fetches a single session by its ID
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('id');
  const includeRequests = request.nextUrl.searchParams.get('includeRequests') === 'true';
  
  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }

  await setupDatabase();

  try {
    let session: Session | null;
    
    if (includeRequests) {
      session = await sessionRepository.getSessionWithRequests(sessionId);
    } else {
      session = await sessionRepository.getSession(sessionId);
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error: unknown) {
    console.error('Error fetching session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch session';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
