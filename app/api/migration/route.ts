import { NextRequest, NextResponse } from 'next/server';
import { runMigrations } from '@/lib/db/migrations'; // Keep runMigrations import
import { setupDatabase } from '@/lib/db/setup'; // Keep setupDatabase import
import { db } from '@/lib/db'; // Keep db import
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
    await runMigrations(); // Await migrations to ensure they complete

    return NextResponse.json({ // Keep success response
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