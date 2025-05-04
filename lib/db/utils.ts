import fs from 'fs';
import { APP_DATA_DIR, DB_FILE } from './constants';

/**
 * Fix database file permissions to ensure it's writable
 * Async version of the permission fix function
 */
export async function fixDatabasePermissions(): Promise<void> {
  try {
    // Fix directory permissions first
    try {
      fs.chmodSync(APP_DATA_DIR, 0o775);
      console.log("[Utils] App data directory permissions set to rwxrwxr-x");
    } catch (err) {
      console.warn("[Utils] Failed to set app directory permissions:", err);
    }

    // Then fix database file permissions if it exists
    if (fs.existsSync(DB_FILE)) {
      // Set permissions to 0666 (rw-rw-rw-)
      fs.chmodSync(DB_FILE, 0o666);
      console.log("[Utils] Database file permissions set to rw-rw-rw-");
    }
  } catch (err) {
    console.warn("[Utils] Failed to set database file permissions:", err);
  }
}

/**
 * Handle readonly database issues
 * Async version of handling readonly database
 */
export async function handleReadonlyDatabase(): Promise<boolean> {
  console.log(`[Utils] Attempting to recover from readonly database`);
  
  try {
    // Check if the database file exists
    if (!fs.existsSync(DB_FILE)) {
      console.log(`[Utils] DB file does not exist, nothing to recover`);
      return false;
    }
    
    // Create a backup of the database file
    const backupFile = `${DB_FILE}.backup-${Date.now()}.db`;
    console.log(`[Utils] Creating backup of database at ${backupFile}`);
    
    try {
      fs.copyFileSync(DB_FILE, backupFile);
      console.log(`[Utils] Successfully created database backup`);
    } catch (backupErr) {
      console.error(`[Utils] Failed to create database backup:`, backupErr);
      // Continue with recovery even if backup fails
    }
    
    // Delete WAL and SHM files which might be causing locking issues
    const walFile = `${DB_FILE}-wal`;
    if (fs.existsSync(walFile)) {
      try {
        fs.unlinkSync(walFile);
        console.log(`[Utils] Successfully deleted WAL file`);
      } catch (walErr) {
        console.error(`[Utils] Failed to delete WAL file:`, walErr);
      }
    }
    
    const shmFile = `${DB_FILE}-shm`;
    if (fs.existsSync(shmFile)) {
      try {
        fs.unlinkSync(shmFile);
        console.log(`[Utils] Successfully deleted SHM file`);
      } catch (shmErr) {
        console.error(`[Utils] Failed to delete SHM file:`, shmErr);
      }
    }
    
    // Fix permissions
    await fixDatabasePermissions();
    
    return true;
  } catch (error) {
    console.error(`[Utils] Error during readonly database recovery:`, error);
    return false;
  }
} 