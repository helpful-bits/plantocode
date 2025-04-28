import { NextRequest, NextResponse } from 'next/server';
import { fixDatabasePermissions, handleReadonlyDatabase } from '@/lib/db/utils';

/**
 * POST /api/database-maintenance/fix-permissions
 * 
 * API endpoint to fix database permissions and attempt recovery
 * from common database issues like readonly errors.
 */
export async function POST(request: NextRequest) {
  console.log('[API database-maintenance/fix-permissions] Attempting to fix database permissions');
  
  try {
    // First attempt to fix database permissions
    const permissionsFixed = await fixDatabasePermissions();
    
    if (!permissionsFixed) {
      console.warn('[API database-maintenance/fix-permissions] Failed to fix database permissions');
    } else {
      console.log('[API database-maintenance/fix-permissions] Successfully fixed database permissions');
    }
    
    // Then try more aggressive recovery if permissions fix wasn't enough
    const handlingResult = await handleReadonlyDatabase();
    
    if (!handlingResult) {
      console.warn('[API database-maintenance/fix-permissions] Failed to handle readonly database issues');
    } else {
      console.log('[API database-maintenance/fix-permissions] Successfully handled readonly database issues');
    }
    
    // Return different status codes based on results
    if (permissionsFixed || handlingResult) {
      return NextResponse.json({ 
        success: true, 
        permissionsFixed,
        readonlyHandled: handlingResult 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fix database issues' 
      }, { 
        status: 500 
      });
    }
  } catch (error) {
    console.error('[API database-maintenance/fix-permissions] Error fixing database permissions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({ 
      success: false, 
      error: `Error during database maintenance: ${errorMessage}` 
    }, { 
      status: 500 
    });
  }
} 