import { NextResponse, NextRequest } from 'next/server';
import { migratePatchPaths } from '@/migrations/patch_path_migration';
import { setupDatabase } from '@/lib/db/setup';

export async function GET(request: NextRequest) { // Keep function signature
  try {
    const result = await migratePatchPaths();
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        updatedCount: result.updated
      });
    } else { // Keep else block
      return NextResponse.json({
        success: false,
        message: result.message
      }, { status: 500 });
    } // Close else block
  } catch (error) {
    console.error('Error running patch path migration:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error running migration'
    }, { status: 500 });
  }
} 