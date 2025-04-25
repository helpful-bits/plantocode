import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db';
import { setupDatabase } from '@/lib/db/setup';

export async function GET(request: NextRequest) {
  try {
    // Make sure database is initialized
    await setupDatabase();
    
    // Fetch all non-cleared requests
    const visibleRequests = await sessionRepository.getAllVisibleGeminiRequests();
    
    // Return visible requests as JSON response
    return NextResponse.json({ 
      success: true, 
      requests: visibleRequests 
    });
  } catch (error) {
    console.error('[API] Error fetching background requests:', error);
    
    // Return error response
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error fetching background requests' 
      }, 
      { status: 500 }
    );
  }
} 