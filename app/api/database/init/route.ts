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
  // Enhanced logging: Log timestamp and request ID to track repeated calls
  const requestId = Math.random().toString(36).substring(2, 15);
  const timestamp = new Date().toISOString();
  console.log(`[DATABASE-INIT] [${timestamp}] POST request received (ID: ${requestId})`);
  
  try {
    const requestHeaders = Object.fromEntries(request.headers.entries());
    console.log(`[DATABASE-INIT] [${requestId}] Headers:`, {
      referer: requestHeaders.referer || 'none',
      'user-agent': requestHeaders['user-agent'] || 'none',
      'content-type': requestHeaders['content-type'] || 'none'
    });
    
    const { action } = await request.json();
    console.log(`[DATABASE-INIT] [${requestId}] Action: ${action}`);

    if (action === 'setup') {
      console.log(`[DATABASE-INIT] [${requestId}] Running setupDatabase with recovery mode`);
      const startTime = performance.now();
      await setupDatabase(true); // Enable recovery mode for setup
      const duration = Math.round(performance.now() - startTime);
      console.log(`[DATABASE-INIT] [${requestId}] Database initialization completed in ${duration}ms`);
      return NextResponse.json({ success: true, message: 'Database initialized successfully' });
    }
    
    if (action === 'migrate') {
      console.log(`[DATABASE-INIT] [${requestId}] Running migrations`);
      const startTime = performance.now();
      await runMigrations();
      const duration = Math.round(performance.now() - startTime);
      console.log(`[DATABASE-INIT] [${requestId}] Migrations completed in ${duration}ms`);
      return NextResponse.json({ 
        success: true, 
        message: 'Migrations completed successfully'
      });
    }
    
    if (action === 'reset') {
      console.log(`[DATABASE-INIT] [${requestId}] Resetting database`);
      const startTime = performance.now();
      await resetDatabase();
      const duration = Math.round(performance.now() - startTime);
      console.log(`[DATABASE-INIT] [${requestId}] Database reset completed in ${duration}ms`);
      return NextResponse.json({ success: true, message: 'Database reset successfully' });
    }

    // No valid action provided
    console.warn(`[DATABASE-INIT] [${requestId}] Invalid action: ${action}`);
    return NextResponse.json(
      { error: 'Invalid action. Use "setup", "migrate", or "reset".' },
      { status: 400 }
    );
  } catch (error) {
    console.error(`[DATABASE-INIT] [${requestId}] Error initializing database:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 