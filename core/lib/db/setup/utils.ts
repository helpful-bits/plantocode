import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import connectionPool from "../connection-pool";
import { APP_DATA_DIR, DB_FILE } from '../constants';

/**
 * Fix database file permissions to ensure it's writable
 */
export async function fixDatabasePermissions(): Promise<void> {
  try {
    // Fix directory permissions first
    try {
      fs.chmodSync(APP_DATA_DIR, 0o775);
      console.log("[Setup] App data directory permissions set to rwxrwxr-x");
    } catch (err) {
      console.warn("[Setup] Failed to set app directory permissions:", err);
    }

    // Then fix database file permissions if it exists
    if (fs.existsSync(DB_FILE)) {
      // Set permissions to 0666 (rw-rw-rw-)
      fs.chmodSync(DB_FILE, 0o666);
      console.log("[Setup] Database file permissions set to rw-rw-rw-");
    }
  } catch (err) {
    console.warn("[Setup] Failed to set database file permissions:", err);
  }
}

/**
 * Creates a minimal database with essential tables for recovery situations
 * Used when normal migrations have failed but we need a working database
 */
export async function createMinimalDatabase(): Promise<void> {
  return connectionPool.withTransaction((db: Database.Database) => {
    try {
      // Create the migrations table if it doesn't exist
      db.prepare(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        )
      `).run();
      
      // Create a minimal version of the meta table for configuration
      db.prepare(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY, 
          value TEXT NOT NULL
        )
      `).run();
      
      // Create diagnostic logs table for tracking errors
      db.prepare(`
        CREATE TABLE IF NOT EXISTS db_diagnostic_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          error_type TEXT NOT NULL,
          error_message TEXT NOT NULL,
          stack_trace TEXT,
          additional_info TEXT
        )
      `).run();
      
      // Set recovery flag in meta table
      db.prepare(`
        INSERT OR REPLACE INTO meta (key, value) 
        VALUES ('recovery_mode', 'true'), ('recovery_timestamp', ?)
      `).run(Date.now());
      
      console.log("Created minimal recovery database successfully");
    } catch (error) {
      console.error("Error creating minimal database:", error);
      throw error;
    }
  });
}

/**
 * Log a database diagnostic error to the db_diagnostic_logs table
 * This helps track database issues for later analysis
 */
export async function logDatabaseError(
  errorType: string,
  errorMessage: string,
  stackTrace?: string,
  additionalInfo?: string
): Promise<void> {
  try {
    return connectionPool.withConnection((db: Database.Database) => {
      // Create the diagnostic logs table if it doesn't exist
      db.prepare(`
        CREATE TABLE IF NOT EXISTS db_diagnostic_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          error_type TEXT NOT NULL,
          error_message TEXT NOT NULL,
          stack_trace TEXT,
          additional_info TEXT
        )
      `).run();
      
      // Log the error
      db.prepare(`
        INSERT INTO db_diagnostic_logs (timestamp, error_type, error_message, stack_trace, additional_info)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        Date.now(),
        errorType,
        errorMessage,
        stackTrace || null,
        additionalInfo || null
      );
    });
  } catch (err) {
    console.error("Error logging database diagnostic info:", err);
  }
}

/**
 * Reset the database by deleting it and recreating it
 * Used for troubleshooting or fresh starts
 */
export async function resetDatabase(): Promise<void> {
  try {
    // Close all connections first
    await connectionPool.closeAll();
    
    console.log("[Reset] Closing all database connections");
    
    // Delete the database file if it exists
    if (fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
      console.log(`[Reset] Deleted database file: ${DB_FILE}`);
    } else {
      console.log(`[Reset] Database file not found, nothing to delete: ${DB_FILE}`);
    }
    
    // Ensure the database directory exists
    if (!fs.existsSync(path.dirname(DB_FILE))) {
      fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
      console.log(`[Reset] Created database directory: ${path.dirname(DB_FILE)}`);
    }
    
    // Create a new database connection and run migrations
    await connectionPool.withTransaction(async (db: Database.Database) => {
      // Create necessary tables
      db.prepare(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY, 
          value TEXT NOT NULL
        )
      `).run();
      
      // Set reset flag
      db.prepare(`
        INSERT OR REPLACE INTO meta (key, value) 
        VALUES ('reset_timestamp', ?)
      `).run(Date.now().toString());
      
      console.log("[Reset] Created new database");
    });
    
    console.log("[Reset] Database reset completed successfully");
  } catch (error) {
    console.error("[Reset] Error during database reset:", error);
    throw error;
  }
}

/**
 * Get information about the database
 */
export async function getDatabaseInfo(): Promise<any> {
  try {
    const info = await connectionPool.withConnection(async (db: Database.Database) => {
      // Check if database file exists
      const fileExists = fs.existsSync(DB_FILE);
      const fileSize = fileExists ? fs.statSync(DB_FILE).size : 0;
      const filePermissions = fileExists ? fs.statSync(DB_FILE).mode : 0;
      
      // Get table counts
      const tables = db.prepare(`
        SELECT name, type FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all() as Array<{name: string, type: string}>;
      
      const tableCounts: Record<string, number> = {};
      
      for (const table of tables) {
        try {
          const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as {count: number} | undefined;
          tableCounts[table.name] = count?.count || 0;
        } catch (err) {
          tableCounts[table.name] = -1; // Error counting
        }
      }
      
      // Get meta information
      const metaEntries = db.prepare(`
        SELECT key, value FROM meta
      `).all() as Array<{key: string, value: string}>;
      
      const meta: Record<string, string> = {};
      for (const entry of metaEntries) {
        meta[entry.key] = entry.value;
      }
      
      return {
        file: {
          path: DB_FILE,
          exists: fileExists,
          size: fileSize,
          sizeFormatted: formatBytes(fileSize),
          permissions: filePermissions.toString(8), // Octal representation
          directory: path.dirname(DB_FILE)
        },
        schema: {
          tables: tables.map(t => t.name),
          tableCount: tables.length,
          tableCounts
        },
        meta,
        connectionPool: {
          activeConnections: connectionPool.getActiveCount(),
          // Adjust this if getMaxConnections is not available
          maxSize: 3  // Using the default value from connection-pool.ts
        }
      };
    });
    
    return info;
  } catch (error) {
    console.error("[Info] Error getting database info:", error);
    return {
      error: error instanceof Error ? error.message : String(error),
      file: {
        path: DB_FILE,
        exists: fs.existsSync(DB_FILE)
      }
    };
  }
}

/**
 * Format bytes to a human-readable string
 */
function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
} 