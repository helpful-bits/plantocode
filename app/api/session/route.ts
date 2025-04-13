import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository';

// GET /api/session?id=...
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('id');
  
  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }
  
  try {
    const session = await sessionRepository.getSession(sessionId);
    
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    
    return NextResponse.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
} 