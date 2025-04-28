import fs from 'fs';
import path from 'path';
import os from 'os';

// Define DB_FILE directly to avoid circular dependency
const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db');

/**
 * Fix database file permissions to ensure it's writable
 * Exported function that can be called from other modules
 */
export async function fixDatabasePermissions(): Promise<boolean> {
  try {
    // Ensure the app directory exists
    if (!fs.existsSync(APP_DATA_DIR)) {
      try {
        fs.mkdirSync(APP_DATA_DIR, { recursive: true });
      } catch (err) {
        console.error("[DB Utils] Failed to create app data directory:", err);
        return false;
      }
    }

    // Fix directory permissions first
    try {
      fs.chmodSync(APP_DATA_DIR, 0o755);
      console.log("[DB Utils] App data directory permissions set to rwxr-xr-x");
    } catch (err) {
      console.warn("[DB Utils] Failed to set app directory permissions:", err);
    }

    // Then fix database file permissions if it exists
    if (fs.existsSync(DB_FILE)) {
      try {
        fs.chmodSync(DB_FILE, 0o666);
        console.log("[DB Utils] Database file permissions set to rw-rw-rw-");
        return true;
      } catch (err) {
        console.warn("[DB Utils] Failed to set database file permissions:", err);
        return false;
      }
    } else {
      console.log("[DB Utils] Database file doesn't exist yet, no permissions to fix");
      return true; // Not an error, file just doesn't exist yet
    }
  } catch (err) {
    console.error("[DB Utils] Error fixing database permissions:", err);
    return false;
  }
}

/**
 * Handle a readonly database by attempting to fix permissions or recreate if needed
 */
export async function handleReadonlyDatabase(): Promise<boolean> {
  console.warn("[DB Utils] Attempting to fix readonly database");
  
  if (!fs.existsSync(DB_FILE)) {
    console.log("[DB Utils] Database file doesn't exist, will be created");
    return true;
  }
  
  try {
    // First try to simply fix permissions
    await fixDatabasePermissions();
    
    // Test if the file is now writable
    fs.accessSync(DB_FILE, fs.constants.W_OK);
    console.log("[DB Utils] Successfully fixed database permissions");
    return true;
  } catch (permErr) {
    console.warn("[DB Utils] Could not fix permissions, trying to recreate database:", permErr);
    
    try {
      // Create a backup of the readonly file
      const backupFile = `${DB_FILE}.readonly-backup-${Date.now()}`;
      fs.copyFileSync(DB_FILE, backupFile);
      console.log(`[DB Utils] Created backup of readonly database at ${backupFile}`);
      
      // Delete the readonly file
      fs.unlinkSync(DB_FILE);
      console.log("[DB Utils] Deleted readonly database file");
      
      // Create an empty file with correct permissions
      fs.writeFileSync(DB_FILE, '');
      await fixDatabasePermissions();
      console.log("[DB Utils] Created new empty database file with correct permissions");
      
      return true;
    } catch (fixErr) {
      console.error("[DB Utils] Failed to fix readonly database:", fixErr);
      return false;
    }
  }
} 