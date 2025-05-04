import { NextRequest, NextResponse } from 'next/server';
import { runMigrations } from '@/lib/db/setup/migrations'; // Import from setup/migrations instead
import { setupDatabase } from '@/lib/db/setup'; // Keep setupDatabase import
import { db } from '@/lib/db'; // Import db

/**
 * API endpoint to explicitly run database migrations
 * This endpoint should be called manually when migrations need to be run
 * GET /api/migration
 */
export async function GET(request: NextRequest) {
  try {
    console.log('Explicitly running database migrations...');

    // First ensure database is set up
    await setupDatabase();

    // Then explicitly run migrations
    await runMigrations(); // Await migrations to ensure they complete

    return NextResponse.json({ // Keep success response
      success: true, 
      message: 'Database migrations completed successfully.' 
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