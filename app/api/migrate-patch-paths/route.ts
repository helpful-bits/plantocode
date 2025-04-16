import { NextResponse, NextRequest } from 'next/server';
import { migratePatchPaths } from '@/migrations/patch_path_migration'; // Keep migration import
import { setupDatabase } from '@/lib/db/setup'; // Keep setupDatabase import

export async function GET(request: NextRequest) {
  try {
    const result = await migratePatchPaths();
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        updatedCount: result.updated
      }); // Keep return block
    } else { // Keep else block
      return NextResponse.json({
        success: false,
        message: result.message
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error running patch path migration:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error running migration'
    }, { status: 500 });
  }
} 