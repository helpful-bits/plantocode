import { NextRequest, NextResponse } from 'next/server';
import {
  checkDatabaseIntegrity,
  recreateDatabaseStructure,
  resetDatabase
} from '@/lib/db/integrity-check';
import fs from 'fs';
import { DB_FILE } from "@/lib/db/constants";

// Only allow this in development mode for security
const isDev = process.env.NODE_ENV === 'development';

/**
 * GET /api/diagnostics/database/repair
 * 
 * API endpoint for database repair and diagnostics.
 * This is only available in development mode for security reasons.
 */
export async function GET(request: NextRequest) {
  // Only allow this endpoint in development mode
  if (!isDev) {
    return NextResponse.json({ 
      error: 'This endpoint is only available in development mode' 
    }, { status: 403 });
  }
  
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'status';
    
    // Check if database file exists
    if (!fs.existsSync(DB_FILE)) {
      return NextResponse.json({
        exists: false,
        message: 'Database file does not exist',
        dbPath: DB_FILE
      });
    }
    
    // Handle different actions
    switch (action) {
      case 'status':
        // Check database integrity
        const integrityResult = await checkDatabaseIntegrity();
        
        return NextResponse.json({
          exists: true,
          isValid: integrityResult.isValid,
          errors: integrityResult.errors,
          dbPath: DB_FILE
        });
        
      case 'repair':
        // Recreate database structure
        const repairResult = await recreateDatabaseStructure();
        
        return NextResponse.json({
          success: repairResult,
          message: repairResult ? 'Database structure recreated successfully' : 'Failed to recreate database structure'
        });
        
      case 'reset':
        // Reset database - DESTRUCTIVE ACTION!
        const token = url.searchParams.get('token');
        if (token !== 'confirm-reset') {
          return NextResponse.json({ 
            error: 'Reset requires confirmation token (token=confirm-reset)' 
          }, { status: 400 });
        }
        
        await resetDatabase();
        
        return NextResponse.json({
          success: true,
          message: 'Database has been reset'
        });
        
      default:
        return NextResponse.json({
          error: `Unknown action: ${action}`
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[API] Database repair error:', error);
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error during database operation'
    }, { status: 500 });
  }
} 