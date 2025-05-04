import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository, getSessionWithRequests, setupDatabase } from '@/lib/db';
import { Session } from '@/types';

// GET /api/session?id=...
// Fetches a single session by its ID
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('id');
  const includeRequests = request.nextUrl.searchParams.get('includeRequests') === 'true';
  
  // Log the sessionId from query params
  console.log(`[API session] GET request sessionId:`, {
    value: sessionId,
    type: typeof sessionId
  });
  
  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }
  
  // Add validation to ensure sessionId is a valid string
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    console.error(`[API session] Invalid sessionId format or type:`, {
      value: sessionId,
      type: typeof sessionId
    });
    return NextResponse.json(
      { error: 'Invalid session ID format' },
      { status: 400 }
    );
  }

  try {
    await setupDatabase();
    
    let session: Session | null;
    
    if (includeRequests) {
      session = await getSessionWithRequests(sessionId);
    } else {
      session = await sessionRepository.getSession(sessionId);
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Ensure we're always returning the session in a consistent structure
    return NextResponse.json({ session });
  } catch (error: unknown) {
    console.error('Error fetching session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch session';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
