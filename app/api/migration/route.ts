import { NextRequest, NextResponse } from 'next/server';
import { runMigrations } from '@/lib/db/migrations';
import { setupDatabase } from '@/lib/db/setup';

/**
 * API endpoint to force migrations to run
 * GET /api/migration
 */
export async function GET(request: NextRequest) {
  try {
    console.log('Forcing database migrations to run...');
    
    // First ensure database is set up
    await setupDatabase();
    
    // Then explicitly run migrations
    runMigrations();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database migrations initiated. Check logs for results.' 
    });
  } catch (error) {
    console.error('Error running migrations:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({ 
      success: false, 
      message: `Migration error: ${errorMessage}` 
    }, { status: 500 });
  }
} 