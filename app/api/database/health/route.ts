import { NextRequest, NextResponse } from 'next/server';
import { setupDatabase, DB_FILE } from '@/lib/db';
import { checkDatabaseIntegrity } from '@/lib/db/integrity-check';
import fs from 'fs';
import { humanFileSize } from '@/lib/utils/file-size';

/**
 * GET /api/database/health
 * 
 * Check database health and return status information
 * 
 * @param request The incoming request object
 * @returns JSON response with database health information
 */
export async function GET(request: NextRequest) {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return NextResponse.json({
        status: 'warning',
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
    
    // Determine status based on integrity check
    const status = integrityResult.isValid ? 'ok' : 'warning';
    const needsRepair = !integrityResult.isValid;

    return NextResponse.json({
      status: status,
      needsRepair: needsRepair,
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