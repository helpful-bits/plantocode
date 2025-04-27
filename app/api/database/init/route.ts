import { NextRequest, NextResponse } from 'next/server';
import { setupDatabase, runMigrations } from '@/lib/db';
import { getDatabaseInfo, resetDatabase } from '@/lib/db/setup';

/**
 * GET /api/database/init
 * 
 * Get information about the database
 */
export async function GET(request: NextRequest) {
  try {
    await setupDatabase(); // Ensure database is initialized before getting info
    const info = await getDatabaseInfo();
    
    return NextResponse.json({
      success: true,
      info
    });
  } catch (error) {
    console.error('[API] Error getting database info:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/database/init
 * 
 * Initialize the database or run migrations
 */
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'setup') {
      await setupDatabase(true); // Enable recovery mode for setup
      return NextResponse.json({ success: true, message: 'Database initialized successfully' });
    }
    
    if (action === 'migrate') {
      await runMigrations();
      return NextResponse.json({ 
        success: true, 
        message: 'Migrations completed successfully'
      });
    }
    
    if (action === 'reset') {
      await resetDatabase();
      return NextResponse.json({ success: true, message: 'Database reset successfully' });
    }

    // No valid action provided
    return NextResponse.json(
      { error: 'Invalid action. Use "setup", "migrate", or "reset".' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Error initializing database:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 