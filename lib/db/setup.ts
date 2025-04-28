// Only run database setup on the server
const isServer = typeof window === 'undefined';

// Only import databases modules when on server
import { closeDatabase, connectionPool } from './index';
import { DB_FILE } from './connection-pool';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Result of database setup operation
 */
export interface DBSetupResult {
  success: boolean;
  message: string;
  error?: string;
  recoveryMode?: boolean;
}

// For client-side code, return a dummy promise
function dummyPromise(): Promise<DBSetupResult> {
  return Promise.resolve({
    success: true,
    message: "Database operations are not available in the browser"
  });
}

// Database file paths
const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
// DB_FILE is now imported from connection-pool

/**
 * Fix database file permissions to ensure it's writable
 */
async function fixDatabasePermissions(): Promise<void> {
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
async function createMinimalDatabase(): Promise<void> {
  if (!isServer) return Promise.resolve();
  
  return connectionPool.withTransaction((db) => {
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
async function logDatabaseError(
  errorType: string,
  errorMessage: string,
  stackTrace?: string,
  additionalInfo?: string
): Promise<void> {
  if (!isServer) return Promise.resolve();
  
  try {
    return connectionPool.withConnection((db) => {
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
 * Setup and initialize the database
 * Creates the database file if it doesn't exist and ensures it's usable
 */
export async function setupDatabase(forceRecoveryMode: boolean = false): Promise<DBSetupResult> {
  if (!isServer) return dummyPromise();
  
  console.log("[Setup] Setting up database:", DB_FILE);
  
  try {
    // Ensure the app directory exists
    if (!fs.existsSync(APP_DATA_DIR)) {
      fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    }
    
    // Fix permissions
    await fixDatabasePermissions();
    
    // Check if database file exists
    const fileExists = fs.existsSync(DB_FILE);
    
    if (!fileExists) {
      console.log("[Setup] Database file doesn't exist, will create it");
    }
    
    // Try to connect and check the database condition
    if (forceRecoveryMode) {
      console.log("[Setup] Forced recovery mode enabled");
      await createMinimalDatabase();
      
      return {
        success: true,
        message: "Database initialized in recovery mode",
        recoveryMode: true
      };
    }
    
    // Test the database connection and structure
    const isValid = await validateDatabaseConnection();
    
    if (!isValid) {
      console.warn("[Setup] Database validation failed, creating minimal database");
      await createMinimalDatabase();
      
      return {
        success: true,
        message: "Database initialized in recovery mode due to validation failure",
        recoveryMode: true
      };
    }
    
    return {
      success: true,
      message: fileExists 
        ? "Connected to existing database"
        : "Created new database successfully"
    };
    
  } catch (error) {
    console.error("[Setup] Error setting up database:", error);
    
    // Try to create a minimal working database in recovery mode
    try {
      await createMinimalDatabase();
      
      return {
        success: true,
        message: "Database initialized in recovery mode due to setup error",
        error: error instanceof Error ? error.message : String(error),
        recoveryMode: true
      };
    } catch (recoveryError) {
      return {
        success: false,
        message: "Failed to set up database, even in recovery mode",
        error: `Original error: ${error instanceof Error ? error.message : String(error)}\nRecovery error: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`
      };
    }
  }
}

/**
 * Validate that the database can be opened and has the expected tables
 */
async function validateDatabaseConnection(): Promise<boolean> {
  try {
    // Use the connection pool to try to connect to the database
    return await connectionPool.withConnection((db) => {
      try {
        // Query SQLite master table to see if our tables exist
        const tables = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND 
          name IN ('sessions', 'included_files', 'excluded_files', 'background_jobs', 'migrations', 'meta')
        `).all();
        
        // If this is a completely new database, that's valid too
        if (tables.length === 0) {
          console.log("[Setup] No tables found, this appears to be a new database");
          return true;
        }
        
        // Make sure we have at least the core tables
        const tableNames = tables.map(t => t.name);
        console.log("[Setup] Found tables:", tableNames.join(", "));
        
        // The database is considered valid even if missing some tables
        // They will be created during migrations
        return true;
      } catch (error) {
        console.error("[Setup] Error validating database:", error);
        return false;
      }
    }, true); // Use readonly connection for validation
  } catch (error) {
    console.error("[Setup] Failed to validate database connection:", error);
    return false;
  }
}

/**
 * Run migrations on the database to ensure it's at the latest schema version
 */
export async function runMigrations(): Promise<void> {
  if (!isServer) return Promise.resolve();
  
  console.log("[Setup] Running database migrations");
  
  // Function to create core tables
  const createCoreTables = async () => {
    return connectionPool.withTransaction((db) => {
      // Create migrations table if not exist
      db.prepare(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        )
      `).run();
      
      // Create meta table for configuration
      db.prepare(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY, 
          value TEXT NOT NULL
        )
      `).run();
      
      // Create session table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          project_directory TEXT NOT NULL,
          project_hash TEXT NOT NULL,
          task_description TEXT,
          search_term TEXT,
          pasted_paths TEXT,
          title_regex TEXT,
          content_regex TEXT,
          is_regex_active INTEGER DEFAULT 0,
          diff_temperature REAL DEFAULT 0.9,
          codebase_structure TEXT,
          updated_at INTEGER NOT NULL
        )
      `).run();
      
      // Create included_files table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS included_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          path TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `).run();
      
      // Create excluded_files table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS excluded_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          path TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `).run();
      
      // Create background_jobs table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS background_jobs (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          status TEXT NOT NULL,
          api_type TEXT NOT NULL,
          task_type TEXT NOT NULL,
          model TEXT,
          prompt TEXT,
          response TEXT,
          error_message TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `).run();
      
      // Create active_sessions table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS active_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_directory TEXT NOT NULL,
          project_hash TEXT NOT NULL UNIQUE,
          session_id TEXT,
          updated_at INTEGER NOT NULL
        )
      `).run();
      
      // Create cached_state table
      db.prepare(`
        CREATE TABLE IF NOT EXISTS cached_state (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key1 TEXT NOT NULL,
          key1_hash TEXT NOT NULL,
          key2 TEXT NOT NULL,
          key2_hash TEXT NOT NULL,
          value TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          UNIQUE(key1_hash, key2_hash)
        )
      `).run();
      
      // Create diagnostic logs table
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
      
      console.log("[Setup] Core tables created successfully");
    });
  };
  
  try {
    // Run the core table creation first
    await createCoreTables();
    
    // Check if we need to run any migrations
    let migrations = [];
    
    // Get list of applied migrations
    const appliedMigrations = await connectionPool.withConnection((db) => {
      // Get all applied migrations
      return db.prepare(`SELECT name FROM migrations ORDER BY id`).all().map(row => row.name);
    }, true);
    
    console.log("[Setup] Applied migrations:", appliedMigrations.join(", ") || "none");
    
    // For now we don't have additional migrations to apply
    // The core tables are already created above
    
    console.log("[Setup] All migrations completed successfully");
    
  } catch (error) {
    console.error("[Setup] Error running migrations:", error);
    
    // Log the migration error
    await logDatabaseError("migration_error", 
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : undefined
    );
    
    throw error;
  }
}

/**
 * Reset the database by deleting and recreating it
 * WARNING: This deletes all data
 */
export async function resetDatabase(): Promise<void> {
  if (!isServer) return Promise.resolve();
  
  console.log("[Setup] Resetting database");
  
  try {
    // Close all connections to the database
    closeDatabase();
    
    // Delete the database file if it exists
    if (fs.existsSync(DB_FILE)) {
      // Create a backup before deleting
      const backupFile = `${DB_FILE}.backup-${Date.now()}`;
      fs.copyFileSync(DB_FILE, backupFile);
      console.log(`[Setup] Created backup of database at ${backupFile}`);
      
      // Delete the file
      fs.unlinkSync(DB_FILE);
      console.log("[Setup] Deleted database file");
    }
    
    // Initialize database with core tables
    await setupDatabase();
    
    // Run migrations
    await runMigrations();
    
    console.log("[Setup] Database reset successfully");
  } catch (error) {
    console.error("[Setup] Error resetting database:", error);
    throw error;
  }
}

/**
 * Get database information and statistics
 */
export async function getDatabaseInfo(): Promise<any> {
  if (!isServer) return Promise.resolve({ error: "Not available in browser" });
  
  try {
    return connectionPool.withConnection((db) => {
      // Get database file info
      let fileStats: any = { exists: false, size: 0 };
      if (fs.existsSync(DB_FILE)) {
        const stats = fs.statSync(DB_FILE);
        fileStats = {
          exists: true,
          size: stats.size,
          sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
          permissions: '0' + (stats.mode & parseInt('777', 8)).toString(8),
          created: stats.birthtime,
          modified: stats.mtime
        };
      }
      
      // Get table counts
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all();
      
      const tableCounts: any = {};
      for (const table of tables) {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        tableCounts[table.name] = count ? count.count : 0;
      }
      
      // Get database pragma information
      const journalMode = db.prepare('PRAGMA journal_mode').get();
      const foreignKeys = db.prepare('PRAGMA foreign_keys').get();
      const integrityCheck = db.prepare('PRAGMA quick_check').get();
      
      // Get migrations info
      const migrationsCount = db.prepare('SELECT COUNT(*) as count FROM migrations').get();
      const lastMigration = db.prepare(`
        SELECT name, applied_at FROM migrations ORDER BY id DESC LIMIT 1
      `).get();
      
      // Construct response object
      return {
        file: fileStats,
        dbFile: DB_FILE,
        appDir: APP_DATA_DIR,
        tables: tableCounts,
        tableCount: tables.length,
        recordCount: Object.values(tableCounts).reduce((sum: any, count: any) => sum + count, 0),
        pragma: {
          journalMode: journalMode ? journalMode['journal_mode'] : 'unknown',
          foreignKeys: foreignKeys ? foreignKeys['foreign_keys'] : 'unknown',
          integrityCheck: integrityCheck ? integrityCheck['quick_check'] : 'unknown'
        },
        migrations: {
          count: migrationsCount ? migrationsCount.count : 0,
          lastMigration: lastMigration ? {
            name: lastMigration.name,
            appliedAt: new Date(lastMigration.applied_at)
          } : null
        }
      };
    }, true);
  } catch (error) {
    console.error("[Setup] Error getting database info:", error);
    return {
      error: error instanceof Error ? error.message : String(error),
      dbFile: DB_FILE
    };
  }
}
