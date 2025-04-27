import { NextRequest, NextResponse } from 'next/server';
import { repairDatabase, backupDatabase } from '@/lib/db/integrity-check';
import { resetDatabase } from '@/lib/db/setup';

export async function POST(request: NextRequest) {
  try {
    console.log('[API] Attempting database repair...');
    
    // First attempt to create a backup
    const backupPath = await backupDatabase();
    
    if (backupPath) {
      console.log('[API] Created database backup at:', backupPath);
    } else {
      console.warn('[API] Failed to create database backup before repair');
    }
    
    // Check if we should do a full reset
    const { action } = await request.json().catch(() => ({ action: 'repair' }));
    
    if (action === 'reset') {
      console.log('[API] Performing full database reset...');
      try {
        // This will completely reset the database and run migrations
        await resetDatabase();
        
        return NextResponse.json({
          success: true,
          message: 'Database was completely reset and recreated',
          backup: backupPath
        });
      } catch (resetError) {
        console.error('[API] Database reset failed:', resetError);
        
        return NextResponse.json({
          success: false,
          error: resetError instanceof Error ? resetError.message : 'Database reset failed',
          backup: backupPath
        }, { status: 500 });
      }
    }
    
    // Try to repair the database
    console.log('[API] Attempting database repair...');
    const repairResult = await repairDatabase();
    
    if (repairResult) {
      return NextResponse.json({
        success: true,
        message: 'Database repair completed successfully',
        backup: backupPath
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Database repair failed',
        backup: backupPath,
        suggestion: 'Try a full database reset'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[API] Error repairing database:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during database repair',
      suggestion: 'Try a full database reset'
    }, { status: 500 });
  }
} 