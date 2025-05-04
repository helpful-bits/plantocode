import { NextRequest, NextResponse } from 'next/server';
import { DB_FILE, isServer } from '@/lib/db';
import { checkDatabaseIntegrity, backupDatabase, recreateDatabaseStructure } from '@/lib/db/integrity-check';
import { resetDatabase } from '@/lib/db/setup';
import fs from 'fs';
import { humanFileSize } from '@/lib/utils/file-size';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Check if we're in development mode for certain operations
const isDev = process.env.NODE_ENV === 'development';

/**
 * POST /api/database/maintenance
 * 
 * Consolidated API endpoint for all database maintenance operations including:
 * - health: Check database health and status
 * - repair: Attempt to repair database issues
 * - reset: Completely reset the database (with confirmation)
 * - backup: Create a database backup
 * - fix-permissions: Fix database file permissions
 * 
 * @param request The incoming request object
 * @returns JSON response with operation results
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { action } = data;

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Missing action parameter' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'health':
        return await handleHealthCheck();
      case 'repair':
        return await handleRepair();
      case 'reset':
        const { confirmed } = data;
        if (!confirmed) {
          return NextResponse.json(
            { success: false, error: 'Reset action requires confirmation' },
            { status: 400 }
          );
        }
        return await handleReset();
      case 'backup':
        return await handleBackup();
      case 'fix-permissions':
        return await handleFixPermissions();
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Database maintenance error:', error);
    return NextResponse.json(
      { success: false, error: `Database maintenance error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  } finally {
    closeDatabase();
  }
}

/**
 * GET handler for direct URL parameters (useful for simple health checks)
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'health';
  
  // For GET requests, we'll treat them like POSTs but use query params
  try {
    switch (action) {
      case 'health':
        return await handleHealthCheck();
      
      case 'status':
        // Only in dev mode, provide detailed diagnostics info
        if (!isDev) {
          return NextResponse.json({ 
            error: 'This detailed status is only available in development mode' 
          }, { status: 403 });
        }
        return await handleDetailedStatus();
      
      case 'backup':
        return await handleBackup();
      
      case 'repair':
        return await handleRepair();
      
      case 'reset':
        // Require confirmation token for reset via GET
        const token = url.searchParams.get('token');
        if (token !== 'confirm-reset') {
          return NextResponse.json({ 
            success: false, 
            error: 'Reset requires confirmation token (token=confirm-reset)' 
          }, { status: 400 });
        }
        return await handleReset();
      
      case 'fix-permissions':
        return await handleFixPermissions();
      
      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[API database/maintenance] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during database maintenance'
    }, { status: 500 });
  }
}

/**
 * Check database health and connection status
 */
async function handleHealthCheck() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return NextResponse.json({
        success: false,
        exists: false,
        message: 'Database file does not exist',
        dbPath: DB_FILE
      });
    }

    const dbStats = fs.statSync(DB_FILE);
    const dbSize = humanFileSize(dbStats.size);
    const dbModified = dbStats.mtime.toISOString();
    
    // Check for WAL and SHM files
    const walFile = `${DB_FILE}-wal`;
    const shmFile = `${DB_FILE}-shm`;
    const walExists = fs.existsSync(walFile);
    const shmExists = fs.existsSync(shmFile);
    
    const walSize = walExists ? humanFileSize(fs.statSync(walFile).size) : null;
    const shmSize = shmExists ? humanFileSize(fs.statSync(shmFile).size) : null;
    
    const integrityResult = await checkDatabaseIntegrity();
    
    return NextResponse.json({
      success: true,
      exists: true,
      isValid: integrityResult.isValid,
      errors: integrityResult.errors,
      dbPath: DB_FILE,
      dbSize,
      dbModified,
      walExists,
      walSize,
      shmExists,
      shmSize
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Attempt to repair database issues
 */
async function handleRepair() {
  try {
    // First run a health check
    if (!fs.existsSync(DB_FILE)) {
      return NextResponse.json({
        success: false,
        message: 'Database file does not exist',
        dbPath: DB_FILE
      });
    }
    
    // Create backup before repair
    const backupPath = await backupDatabase();
    if (!backupPath) {
      return NextResponse.json(
        { success: false, error: 'Failed to create backup before repair' },
        { status: 500 }
      );
    }
    
    // Repair database structure
    const repairResult = await recreateDatabaseStructure();
    
    return NextResponse.json({
      success: true,
      repaired: repairResult,
      backupPath,
      message: repairResult 
        ? 'Database repaired successfully' 
        : 'Database repair failed'
    });
  } catch (error) {
    console.error('Repair error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Reset database completely
 */
async function handleReset() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return NextResponse.json({
        success: false,
        message: 'Database file does not exist, nothing to reset',
      });
    }
    
    // Create backup before reset
    const backupPath = await backupDatabase();
    if (!backupPath) {
      return NextResponse.json(
        { success: false, error: 'Failed to create backup before reset' },
        { status: 500 }
      );
    }
    
    // Reset database
    const resetResult = await resetDatabase();
    
    return NextResponse.json({
      success: true,
      backupPath,
      message: resetResult === undefined 
        ? 'Database reset successfully' 
        : 'Database reset failed'
    });
  } catch (error) {
    console.error('Reset error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Create a database backup
 */
async function handleBackup() {
  try {
    const backupPath = await backupDatabase();
    
    if (!backupPath) {
      return NextResponse.json(
        { success: false, error: 'Failed to create backup' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      backupPath,
      message: `Backup created at: ${backupPath}`
    });
  } catch (error) {
    console.error('Backup error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Fix database permissions and handle readonly issues
 */
async function handleFixPermissions() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return NextResponse.json({
        success: false,
        message: 'Database file does not exist',
        dbPath: DB_FILE
      });
    }

    // Fix permissions
    const isUnix = process.platform === 'darwin' || process.platform === 'linux';
    
    if (isUnix) {
      try {
        // Set read/write permissions for user
        await execPromise(`chmod 644 "${DB_FILE}"`);
        
        // Handle WAL and SHM files if they exist
        const walFile = `${DB_FILE}-wal`;
        const shmFile = `${DB_FILE}-shm`;
        
        if (fs.existsSync(walFile)) {
          await execPromise(`chmod 644 "${walFile}"`);
        }
        
        if (fs.existsSync(shmFile)) {
          await execPromise(`chmod 644 "${shmFile}"`);
        }
        
        return NextResponse.json({
          success: true,
          message: 'Database file permissions fixed'
        });
      } catch (error) {
        console.error('Error fixing permissions:', error);
        return NextResponse.json(
          { success: false, error: String(error) },
          { status: 500 }
        );
      }
    } else {
      // On Windows, we just check if we can write to the file
      try {
        const testWrite = fs.openSync(DB_FILE, 'a');
        fs.closeSync(testWrite);
        
        return NextResponse.json({
          success: true,
          message: 'Database file is writable'
        });
      } catch (error) {
        console.error('Error checking file permissions:', error);
        return NextResponse.json(
          { 
            success: false, 
            error: 'Cannot write to database file. Please check permissions.' 
          },
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error('Fix permissions error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Get detailed database status (development only)
 */
async function handleDetailedStatus() {
  if (!isDev || !isServer) {
    return NextResponse.json({ 
      error: 'Detailed status is only available in development mode on the server' 
    }, { status: 403 });
  }
  
  try {
    const integrityResult = await checkDatabaseIntegrity();
    const dbSize = fs.existsSync(DB_FILE) 
      ? fs.statSync(DB_FILE).size 
      : 0;
    
    const walFile = `${DB_FILE}-wal`;
    const shmFile = `${DB_FILE}-shm`;
    const hasWal = fs.existsSync(walFile);
    const hasShm = fs.existsSync(shmFile);
    
    return NextResponse.json({
      exists: fs.existsSync(DB_FILE),
      size: dbSize,
      sizeFormatted: humanFileSize(dbSize),
      location: DB_FILE,
      walExists: hasWal,
      shmExists: hasShm,
      walSize: hasWal ? fs.statSync(walFile).size : 0,
      shmSize: hasShm ? fs.statSync(shmFile).size : 0,
      integrity: integrityResult
    });
  } catch (error) {
    console.error('[API] Error getting detailed database status:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error getting database status'
    }, { status: 500 });
  }
}

async function closeDatabase() {
  // Implementation of closeDatabase function
} 