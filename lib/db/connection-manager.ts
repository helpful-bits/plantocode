import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { APP_DATA_DIR, DB_FILE } from './constants';

// Connection pool settings
const CONNECTION_TIMEOUT_MS = 5000; // 5 seconds busy timeout

// Variables to cache permission check results
let lastPermissionsCheck = 0;
const PERMISSIONS_CHECK_INTERVAL = 60000; // 1 minute - cache permission check results
let permissionsOK = false;

/**
 * Synchronous version of ensuring database permissions are correct
 * This is the core implementation that both sync and async versions use
 */
export function ensureDbPermissionsSync(): boolean {
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  
  // If we've checked permissions recently and they were OK, skip the check
  if (permissionsOK && now - lastPermissionsCheck < PERMISSIONS_CHECK_INTERVAL) {
    return true;
  }
  
  console.log(`[DB Manager] Starting permission check at ${timestamp}`);
  
  try {
    // Check parent directory permissions first
    try {
      fs.accessSync(APP_DATA_DIR, fs.constants.W_OK);
      console.log(`[DB Manager] App data directory ${APP_DATA_DIR} is writable`);
    } catch (dirErr) {
      console.error(`[DB Manager] App data directory ${APP_DATA_DIR} is not writable: ${dirErr instanceof Error ? dirErr.message : String(dirErr)}`);
      // Still try to create/fix it below
    }

    // Create directory if needed
    if (!fs.existsSync(APP_DATA_DIR)) {
      try {
        fs.mkdirSync(APP_DATA_DIR, { recursive: true });
        console.log(`[DB Manager] Created app data directory at ${APP_DATA_DIR}`);
      } catch (err) {
        console.error(`[DB Manager] Failed to create app data directory at ${APP_DATA_DIR}: ${err instanceof Error ? err.message : String(err)}`);
        permissionsOK = false;
        lastPermissionsCheck = now;
        return false;
      }
    }
    
    // Set directory permissions - critical for SQLite
    try {
      // Get current permissions before changing
      const currentDirPerms = fs.statSync(APP_DATA_DIR).mode & 0o777;
      const targetDirPerms = 0o775;
      
      // Only modify if permissions are different
      if (currentDirPerms !== targetDirPerms) {
        fs.chmodSync(APP_DATA_DIR, targetDirPerms);
        console.log(`[DB Manager] Changed app data directory permissions at ${APP_DATA_DIR} from ${currentDirPerms.toString(8)} to ${targetDirPerms.toString(8)}`);
      } else {
        console.log(`[DB Manager] App data directory permissions already at target ${currentDirPerms.toString(8)}`);
      }
    } catch (err) {
      console.warn(`[DB Manager] Failed to set app directory permissions at ${APP_DATA_DIR} - this may cause issues: ${err instanceof Error ? err.message : String(err)}`);
    }
    
    // Set database file permissions if it exists
    if (fs.existsSync(DB_FILE)) {
      try {
        // Get current permissions before changing
        const currentDBPerms = fs.statSync(DB_FILE).mode & 0o777;
        const targetDBPerms = 0o666;
        
        // Only modify if permissions are different
        if (currentDBPerms !== targetDBPerms) {
          fs.chmodSync(DB_FILE, targetDBPerms);
          console.log(`[DB Manager] Changed database file permissions at ${DB_FILE} from ${currentDBPerms.toString(8)} to ${targetDBPerms.toString(8)}`);
        } else {
          console.log(`[DB Manager] Database file permissions already at target ${currentDBPerms.toString(8)}`);
        }
      } catch (err) {
        console.warn(`[DB Manager] Failed to set database file permissions at ${DB_FILE} - this may cause issues: ${err instanceof Error ? err.message : String(err)}`);
        permissionsOK = false;
        lastPermissionsCheck = now;
        return false;
      }
    } else {
      console.log(`[DB Manager] Database file doesn't exist yet at ${DB_FILE}, no permissions to fix`);
    }
    
    // Set WAL file permissions if it exists
    const walFile = `${DB_FILE}-wal`;
    if (fs.existsSync(walFile)) {
      try {
        // Get current permissions before changing
        const currentWalPerms = fs.statSync(walFile).mode & 0o777;
        const targetWalPerms = 0o666;
        
        // Only modify if permissions are different
        if (currentWalPerms !== targetWalPerms) {
          fs.chmodSync(walFile, targetWalPerms);
          console.log(`[DB Manager] Changed WAL file permissions at ${walFile} from ${currentWalPerms.toString(8)} to ${targetWalPerms.toString(8)}`);
        } else {
          console.log(`[DB Manager] WAL file permissions already at target ${currentWalPerms.toString(8)}`);
        }
      } catch (err) {
        console.warn(`[DB Manager] Failed to set WAL file permissions at ${walFile} - journal operations may fail: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    // Set SHM file permissions if it exists
    const shmFile = `${DB_FILE}-shm`;
    if (fs.existsSync(shmFile)) {
      try {
        // Get current permissions before changing
        const currentShmPerms = fs.statSync(shmFile).mode & 0o777;
        const targetShmPerms = 0o666;
        
        // Only modify if permissions are different
        if (currentShmPerms !== targetShmPerms) {
          fs.chmodSync(shmFile, targetShmPerms);
          console.log(`[DB Manager] Changed SHM file permissions at ${shmFile} from ${currentShmPerms.toString(8)} to ${targetShmPerms.toString(8)}`);
        } else {
          console.log(`[DB Manager] SHM file permissions already at target ${currentShmPerms.toString(8)}`);
        }
      } catch (err) {
        console.warn(`[DB Manager] Failed to set SHM file permissions at ${shmFile} - shared memory operations may fail: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    // Update cache
    permissionsOK = true;
    lastPermissionsCheck = now;
    console.log(`[DB Manager] Database permissions check and fix completed successfully at ${timestamp}`);
    return true;
  } catch (err) {
    console.error(`[DB Manager] Error fixing database permissions at ${timestamp}: ${err instanceof Error ? err.message : String(err)}`);
    permissionsOK = false;
    lastPermissionsCheck = now;
    return false;
  }
}

/**
 * Ensures database permissions are correct (async wrapper around sync implementation)
 */
export async function ensureDbPermissions(): Promise<boolean> {
  return Promise.resolve(ensureDbPermissionsSync());
}

/**
 * Synchronous version of handling readonly database
 * This is the core implementation that both sync and async versions use
 */
export function handleReadonlyDatabaseSync(): boolean {
  console.log(`[DB Manager] Attempting to recover from readonly database at ${new Date().toISOString()}`);
  
  try {
    // Check if the database file exists
    if (!fs.existsSync(DB_FILE)) {
      console.log(`[DB Manager] DB file does not exist at ${DB_FILE}, nothing to recover`);
      return false;
    }
    
    // Create a backup of the database file
    const backupFile = `${DB_FILE}.backup-${Date.now()}.db`;
    console.log(`[DB Manager] Creating backup of database at ${backupFile}`);
    
    try {
      fs.copyFileSync(DB_FILE, backupFile);
      console.log(`[DB Manager] Successfully created database backup at ${backupFile}`);
    } catch (backupErr) {
      console.error(`[DB Manager] Failed to create database backup: ${backupErr instanceof Error ? backupErr.message : String(backupErr)}`);
      // Continue with recovery even if backup fails
    }
    
    // Try to fix permissions first
    let permissionFixed = false;
    try {
      permissionFixed = ensureDbPermissionsSync();
      console.log(`[DB Manager] Permission fix attempt result: ${permissionFixed ? 'successful' : 'failed'}`);
    } catch (chmodErr) {
      console.error(`[DB Manager] Failed to change permissions on DB file: ${chmodErr instanceof Error ? chmodErr.message : String(chmodErr)}`);
    }
    
    // Check if fixing permissions resolved the issue
    if (permissionFixed) {
      try {
        // Try to open the database in write mode
        const testDb = new Database(DB_FILE, { readonly: false });
        testDb.close();
        console.log(`[DB Manager] Successfully opened database in write mode after fixing permissions`);
        return true;
      } catch (testOpenErr) {
        console.log(`[DB Manager] Fixing permissions didn't resolve readonly issue, continuing with recovery process`);
        // Continue with recovery
      }
    }
    
    // More aggressive recovery:
    // Delete wal and shm files since they might be causing locking issues
    const walFile = `${DB_FILE}-wal`;
    if (fs.existsSync(walFile)) {
      try {
        fs.unlinkSync(walFile);
        console.log(`[DB Manager] Successfully deleted WAL file at ${walFile}`);
      } catch (walErr) {
        console.error(`[DB Manager] Failed to delete WAL file: ${walErr instanceof Error ? walErr.message : String(walErr)}`);
      }
    }
    
    const shmFile = `${DB_FILE}-shm`;
    if (fs.existsSync(shmFile)) {
      try {
        fs.unlinkSync(shmFile);
        console.log(`[DB Manager] Successfully deleted SHM file at ${shmFile}`);
      } catch (shmErr) {
        console.error(`[DB Manager] Failed to delete SHM file: ${shmErr instanceof Error ? shmErr.message : String(shmErr)}`);
      }
    }
    
    // Final check - try to open in write mode again
    try {
      const testDb = new Database(DB_FILE, { readonly: false });
      console.log(`[DB Manager] Recovery successful: database can now be opened in write mode`);
      
      // Run pragma to check database integrity
      const integrityCheck = testDb.prepare('PRAGMA integrity_check').get();
      console.log(`[DB Manager] Database integrity check: ${JSON.stringify(integrityCheck)}`);
      
      testDb.close();
      return true;
    } catch (finalErr) {
      console.error(`[DB Manager] Recovery failed, database still readonly: ${finalErr instanceof Error ? finalErr.message : String(finalErr)}`);
      
      // If all else fails, try to recreate the database
      try {
        // Delete the readonly file
        fs.unlinkSync(DB_FILE);
        console.log(`[DB Manager] Deleted readonly database file at ${DB_FILE}`);
        
        // Create an empty file with correct permissions
        console.log(`[DB Manager] Creating new empty database file at ${DB_FILE}`);
        fs.writeFileSync(DB_FILE, '');
        
        // Set correct permissions
        const newPermissionResult = ensureDbPermissionsSync();
        console.log(`[DB Manager] Permission setting result: ${newPermissionResult ? 'successful' : 'failed'}`);
        
        return newPermissionResult;
      } catch (recreateErr) {
        console.error(`[DB Manager] Failed to recreate database: ${recreateErr instanceof Error ? recreateErr.message : String(recreateErr)}`);
        return false;
      }
    }
  } catch (error) {
    console.error(`[DB Manager] Error during readonly database recovery: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Handles readonly database issues (async wrapper around sync implementation)
 */
export async function handleReadonlyDatabase(): Promise<boolean> {
  return Promise.resolve(handleReadonlyDatabaseSync());
} 