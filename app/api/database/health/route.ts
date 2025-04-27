import { NextRequest, NextResponse } from 'next/server';
import { setupDatabase } from '@/lib/db';
import { checkDatabaseIntegrity } from '@/lib/db/integrity-check';

/**
 * GET /api/database/health
 * Checks database connection and health
 */
export async function GET(request: NextRequest) {
  try {
    // First try to initialize the database with recovery mode enabled if needed
    const setupResult = await setupDatabase(true);
    
    if (!setupResult.success) {
      // If setup failed, return the error
      return NextResponse.json({
        status: 'error',
        error: setupResult.message,
        details: setupResult.error
      }, { status: 500 });
    }
    
    // Run a quick integrity check
    let integrityResult;
    try {
      integrityResult = await checkDatabaseIntegrity();
    } catch (integrityError) {
      console.error('[API] Error checking database integrity:', integrityError);
      
      // Return warning with integrity check error
      return NextResponse.json({
        status: 'warning',
        error: 'Error checking database integrity',
        details: integrityError instanceof Error ? integrityError.message : String(integrityError),
        needsRepair: true
      }, { status: 200 }); // Return 200 with warning status
    }
    
    if (!integrityResult.isValid) {
      // Database has integrity issues
      return NextResponse.json({
        status: 'warning',
        error: 'Database integrity issues detected',
        details: integrityResult.errors,
        needsRepair: true
      }, { status: 200 }); // Return 200 with warning status
    }
    
    // All is well
    return NextResponse.json({
      status: 'ok',
      message: 'Database is healthy',
      recoveryMode: setupResult.recoveryMode || false
    });
  } catch (error) {
    console.error('[API] Database health check failed:', error);
    
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Database health check failed',
    }, { status: 500 });
  }
} 