import { NextRequest, NextResponse } from 'next/server';
import { 
  backupDatabase, 
  checkDatabaseIntegrity,
  recreateDatabaseStructure,
  resetDatabase
} from '@/lib/db/integrity-check';
import { isServer } from '@/lib/db';
import os from 'os';
import path from 'path';
import fs from 'fs';

const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db');

// Only allow this in development mode for security
const isDev = process.env.NODE_ENV === 'development';

/**
 * Endpoint to repair the database when it gets into an unrecoverable state
 * GET /api/diagnostics/database/repair?action=ACTION
 */
export async function GET(request: NextRequest) {
  if (!isDev) {
    return NextResponse.json({ 
      error: 'This endpoint is only available in development mode' 
    }, { status: 403 });
  }
  
  if (!isServer) {
    return NextResponse.json({ 
      error: 'This endpoint can only be called on the server' 
    }, { status: 400 });
  }
  
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'status';
    
    switch (action) {
      case 'status': {
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
          sizeFormatted: formatBytes(dbSize),
          location: DB_FILE,
          walExists: hasWal,
          shmExists: hasShm,
          walSize: hasWal ? fs.statSync(walFile).size : 0,
          shmSize: hasShm ? fs.statSync(shmFile).size : 0,
          integrity: integrityResult
        });
      }
      
      case 'backup': {
        const backupPath = await backupDatabase();
        if (!backupPath) {
          return NextResponse.json({ 
            success: false, 
            error: 'Failed to create backup' 
          }, { status: 500 });
        }
        
        return NextResponse.json({
          success: true,
          backupPath,
          message: `Database backed up to ${backupPath}`
        });
      }
      
      case 'repair': {
        // First create a backup
        const backupPath = await backupDatabase();
        if (!backupPath) {
          return NextResponse.json({ 
            success: false, 
            error: 'Failed to create backup before repair' 
          }, { status: 500 });
        }
        
        // Then run the repair
        const success = await recreateDatabaseStructure();
        
        if (success) {
          return NextResponse.json({
            success: true,
            backupPath,
            message: `Database structure repaired. Backup created at ${backupPath}`
          });
        } else {
          return NextResponse.json({ 
            success: false, 
            backupPath,
            error: 'Failed to repair database structure' 
          }, { status: 500 });
        }
      }
      
      case 'reset': {
        // Require confirmation token for destructive action
        const token = url.searchParams.get('token');
        if (token !== 'confirm-reset') {
          return NextResponse.json({ 
            success: false, 
            error: 'Reset requires confirmation token (token=confirm-reset)' 
          }, { status: 400 });
        }
        
        // First create a backup
        const backupPath = await backupDatabase();
        if (!backupPath) {
          return NextResponse.json({ 
            success: false, 
            error: 'Failed to create backup before reset' 
          }, { status: 500 });
        }
        
        // Then reset the database
        const success = await resetDatabase();
        
        if (success) {
          return NextResponse.json({
            success: true,
            backupPath,
            message: `Database has been reset. Backup created at ${backupPath}`
          });
        } else {
          return NextResponse.json({ 
            success: false, 
            backupPath,
            error: 'Failed to reset database' 
          }, { status: 500 });
        }
      }
      
      default:
        return NextResponse.json({ 
          error: `Unknown action: ${action}` 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in database diagnostics API:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

// Helper function to format bytes to human-readable size
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
} 