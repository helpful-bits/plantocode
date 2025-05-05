import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository, setupDatabase } from '@/lib/db';
import { Session } from '@/types';
import { headers } from 'next/headers';
import { rateLimitCheck } from '@/lib/rate-limit';
import { validateSessionData } from './helpers';

/**
 * PATCH /api/session/[sessionId]/state
 * Updates specific fields of a session without overwriting the entire session
 */
export async function PATCH(
  request: NextRequest,
  context: { params: { sessionId: string } }
) {
  // Get the session ID from the params
  const { sessionId } = context.params;
  
  // Log detailed information about the sessionId
  console.log(`[API session/state] SessionId parameter received:`, {
    value: sessionId,
    type: typeof sessionId,
    length: sessionId ? sessionId.length : 0
  });
  
  // Add strict validation for sessionId
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    console.error(`[API session/state] Invalid sessionId format or type:`, {
      value: sessionId,
      type: typeof sessionId
    });
    return NextResponse.json(
      { error: 'Invalid session ID format', retryable: false },
      { status: 400 }
    );
  }
  
  // Start timestamp for logging request duration
  const requestStartTime = Date.now();
  const timestamp = new Date(requestStartTime).toISOString();
  console.log(`[API session/state] Request started at ${timestamp} for session ${sessionId}`);
  
  // Get request body and log detailed info about the updates
  let sessionData: Partial<Session>;
  try {
    sessionData = await request.json();
    console.log(`[API session/state] PATCH details at ${timestamp}:
      - Session ID: ${sessionId}
      - Fields being updated: ${Object.keys(sessionData).join(', ')}
      - Referrer: ${request.headers.get('referer')}
      - User-Agent: ${request.headers.get('user-agent')}
      - Content-Length: ${request.headers.get('content-length')}
    `);
  } catch (error) {
    console.error(`[API session/state] Error parsing request body:`, error);
    return NextResponse.json(
      { error: 'Invalid request body', retryable: false },
      { status: 400 }
    );
  }
  
  // Rate limit check
  const headersList = await headers();
  const clientIp = headersList.get('x-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown';
  const operationId = headersList.get('x-operation-id') || `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const rateLimitKey = `session:state:patch:${sessionId}:${clientIp}`;
  const isRateLimited = await rateLimitCheck(rateLimitKey, 10, 30); // 10 requests per 30 seconds
  
  if (isRateLimited) {
    console.warn(`[API session/state] Rate limit exceeded for session ${sessionId}, IP: ${clientIp}, OperationID: ${operationId}`);
    return NextResponse.json(
      { 
        error: 'Too many requests. Please try again later.',
        rateLimited: true,
        retryable: true,
        retryAfter: 5, // Suggested retry delay in seconds
        code: 'RATE_LIMITED'
      }, 
      { 
        status: 429,
        headers: {
          'Retry-After': '5',
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Window': '30s'
        }
      }
    );
  }
  
  try {
    // Ensure database is initialized
    console.log(`[API session/state] Setting up database connection for session ${sessionId}...`);
    await setupDatabase();
    
    // Validate that the session exists
    const existingSession = await sessionRepository.getSession(sessionId);
    
    if (!existingSession) {
      console.error(`[API session/state] Session ${sessionId} not found`);
      return NextResponse.json(
        { error: 'Session not found', retryable: false },
        { status: 404 }
      );
    }
    
    // Validate session data fields
    const validationError = validateSessionData(sessionData);
    if (validationError) {
      console.error(`[API session/state] Validation error for session ${sessionId}: ${validationError}`);
      return NextResponse.json(
        { error: validationError, retryable: false },
        { status: 400 }
      );
    }
    
    // Directly call repository method to update session fields
    await sessionRepository.updateSessionFields(sessionId, sessionData);
    
    // Calculate total request duration
    const duration = Date.now() - requestStartTime;
    
    console.log(`[API session/state] Successfully updated session ${sessionId} in ${duration}ms`);
    
    // Flag slow responses
    if (duration > 5000) {
      console.warn(`[API session/state] Slow API response (${duration}ms) detected for session ${sessionId}`);
    }
    
    return NextResponse.json({ 
      success: true, 
      updated: Object.keys(sessionData),
      timestamp: Date.now(),
      operationId
    });
    
  } catch (error) {
    const duration = Date.now() - requestStartTime;
    
    console.error(`[API session/state] Error updating session ${sessionId} after ${duration}ms:`, error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : String(error),
        retryable: false
      }, 
      { status: 500 }
    );
  }
} 