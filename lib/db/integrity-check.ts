import fs from 'fs';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ensureConnection, db, closeDatabase } from './index';
import { DB_FILE } from './connection-pool';

const execAsync = promisify(exec);

const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
// DB_FILE is now imported from connection-pool
const BACKUP_DIR = path.join(APP_DATA_DIR, 'backups');

export interface IntegrityResult {
  isValid: boolean;
  errors: string[];
  details?: any;
}

/**
 * Create a backup of the database with timestamp
 * @returns Path to the backup file, or null if backup failed
 */
export async function backupDatabase(): Promise<string | null> {
  try {
    // Check if source database exists
    if (!fs.existsSync(DB_FILE)) {
      console.error('Cannot backup database: file does not exist:', DB_FILE);
      return null;
    }
    
    // Create backups directory if it doesn't exist
    const backupsDir = path.join(APP_DATA_DIR, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    
    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupsDir, `ai-architect-studio-${timestamp}.db`);
    
    // Make sure the database is closed before copying
    try {
      await closeDatabase();
    } catch (closeErr) {
      console.warn('Error closing database before backup:', closeErr);
      // Continue with backup attempt even if close fails
    }
    
    // Copy the database file
    fs.copyFileSync(DB_FILE, backupFile);
    
    console.log(`Database backed up to ${backupFile}`);
    return backupFile;
  } catch (error) {
    console.error('Error creating database backup:', error);
    return null;
  }
}

/**
 * Check database integrity using SQLite's integrity_check pragma
 */
export async function checkDatabaseIntegrity(): Promise<IntegrityResult> {
  try {
    const database = await ensureConnection();
    const errors: string[] = [];
    
    // Run SQLite integrity check
    const integrityResults = await new Promise<any[]>((resolve, reject) => {
      database.all('PRAGMA integrity_check;', (err: Error | null, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
    
    // If there's only one row with "ok", the database is fine
    const isIntegrityOk = integrityResults.length === 1 && 
                         integrityResults[0].integrity_check === 'ok';
    
    if (!isIntegrityOk) {
      errors.push('Database integrity check failed');
      integrityResults.forEach(row => {
        if (row.integrity_check !== 'ok') {
          errors.push(row.integrity_check);
        }
      });
    }
    
    // Check foreign key constraints
    const foreignKeyCheck = await new Promise<any[]>((resolve, reject) => {
      database.all('PRAGMA foreign_key_check;', (err: Error | null, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
    
    if (foreignKeyCheck.length > 0) {
      errors.push('Foreign key constraint violations found');
      foreignKeyCheck.forEach(violation => {
        errors.push(`Table ${violation.table}, rowid ${violation.rowid}, parent ${violation.parent}`);
      });
    }
    
    return {
      isValid: isIntegrityOk && foreignKeyCheck.length === 0,
      errors,
      details: {
        integrityCheck: integrityResults,
        foreignKeyCheck
      }
    };
  } catch (error) {
    console.error('Error checking database integrity:', error);
    return {
      isValid: false,
      errors: [`Error checking integrity: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

/**
 * Create a minimal database structure for recovery
 * This attempts to recreate the essential tables while preserving data where possible
 */
export async function recreateDatabaseStructure(): Promise<boolean> {
  try {
    // First make a backup
    const backupPath = await backupDatabase();
    if (!backupPath) {
      console.error('Failed to create backup before recreating database structure');
      return false;
    }
    
    const database = await ensureConnection();
    
    // Start a transaction
    await new Promise<void>((resolve, reject) => {
      database.run('BEGIN TRANSACTION', (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    try {
      // Create temporary tables for data we want to preserve
      await new Promise<void>((resolve, reject) => {
        database.run('CREATE TEMPORARY TABLE temp_sessions AS SELECT * FROM sessions', (err: Error | null) => {
          // Ignore errors if table doesn't exist
          resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run('CREATE TEMPORARY TABLE temp_background_jobs AS SELECT * FROM background_jobs', (err: Error | null) => {
          // Ignore errors if table doesn't exist
          resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run('CREATE TEMPORARY TABLE temp_cached_state AS SELECT * FROM cached_state', (err: Error | null) => {
          // Ignore errors if table doesn't exist
          resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run('CREATE TEMPORARY TABLE temp_active_sessions AS SELECT * FROM active_sessions', (err: Error | null) => {
          // Ignore errors if table doesn't exist
          resolve();
        });
      });
      
      // Drop all existing tables
      const tables = await new Promise<string[]>((resolve, reject) => {
        database.all(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name NOT LIKE 'temp_%' AND name NOT LIKE 'sqlite_%'
        `, (err: Error | null, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.name));
        });
      });
      
      for (const table of tables) {
        await new Promise<void>((resolve, reject) => {
          database.run(`DROP TABLE IF EXISTS ${table}`, (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      
      // Create essential tables
      await new Promise<void>((resolve, reject) => {
        database.run(`
          CREATE TABLE migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            applied_at INTEGER NOT NULL
          )
        `, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run(`
          CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            project_directory TEXT,
            project_hash TEXT,
            task_description TEXT,
            search_term TEXT,
            pasted_paths TEXT,
            title_regex TEXT,
            content_regex TEXT,
            is_regex_active INTEGER DEFAULT 1 CHECK(is_regex_active IN (0, 1)),
            diff_temperature REAL DEFAULT 0.9,
            codebase_structure TEXT,
            updated_at INTEGER NOT NULL
          )
        `, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run(`
          CREATE TABLE background_jobs (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            prompt TEXT NOT NULL,
            status TEXT DEFAULT 'idle' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing')),
            start_time INTEGER,
            end_time INTEGER,
            xml_path TEXT,
            status_message TEXT,
            tokens_received INTEGER DEFAULT 0,
            chars_received INTEGER DEFAULT 0,
            last_update INTEGER,
            created_at INTEGER NOT NULL,
            cleared INTEGER DEFAULT 0 CHECK(cleared IN (0, 1)),
            api_type TEXT DEFAULT 'gemini' NOT NULL,
            task_type TEXT DEFAULT 'xml_generation' NOT NULL,
            model_used TEXT,
            max_output_tokens INTEGER,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          )
        `, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run(`
          CREATE TABLE cached_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run(`
          CREATE TABLE active_sessions (
            project_directory TEXT PRIMARY KEY,
            session_id TEXT,
            updated_at INTEGER NOT NULL
          )
        `, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Create indexes
      await new Promise<void>((resolve, reject) => {
        database.run(`CREATE INDEX idx_sessions_project_hash ON sessions(project_hash)`, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run(`CREATE INDEX idx_sessions_project_directory ON sessions(project_directory)`, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run(`CREATE INDEX idx_sessions_updated_at ON sessions(updated_at)`, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run(`CREATE INDEX idx_background_jobs_session_id ON background_jobs(session_id)`, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run(`CREATE INDEX idx_background_jobs_status ON background_jobs(status)`, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Restore data where possible
      await new Promise<void>((resolve, reject) => {
        database.run(`
          INSERT OR IGNORE INTO sessions
          SELECT * FROM temp_sessions
        `, (err: Error | null) => {
          // Ignore errors
          resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run(`
          INSERT OR IGNORE INTO background_jobs
          SELECT * FROM temp_background_jobs
        `, (err: Error | null) => {
          // Ignore errors
          resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run(`
          INSERT OR IGNORE INTO cached_state
          SELECT * FROM temp_cached_state
        `, (err: Error | null) => {
          // Ignore errors
          resolve();
        });
      });
      
      await new Promise<void>((resolve, reject) => {
        database.run(`
          INSERT OR IGNORE INTO active_sessions
          SELECT * FROM temp_active_sessions
        `, (err: Error | null) => {
          // Ignore errors
          resolve();
        });
      });
      
      // Commit the transaction
      await new Promise<void>((resolve, reject) => {
        database.run('COMMIT', (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      return true;
    } catch (err) {
      console.error('Error recreating database structure:', err);
      
      // Try to rollback
      try {
        await new Promise<void>((resolve, reject) => {
          database.run('ROLLBACK', (err: Error | null) => {
            if (err) {
              console.error('Error rolling back transaction:', err);
            }
            resolve();
          });
        });
      } catch (rollbackErr) {
        console.error('Error during rollback:', rollbackErr);
      }
      
      return false;
    }
  } catch (err) {
    console.error('Error recreating database structure:', err);
    return false;
  }
}

/**
 * Reset the database to a clean state
 * WARNING: This deletes all data!
 */
export async function resetDatabase(): Promise<boolean> {
  try {
    // First make a backup
    const backupPath = await backupDatabase();
    if (!backupPath) {
      console.error('Failed to create backup before resetting database');
      return false;
    }
    
    // Close any open connections
    try {
      await closeDatabase();
    } catch (closeErr) {
      console.warn('Error closing database:', closeErr);
    }
    
    // Delete the database file
    if (fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
    
    // Recreate essential structure
    const database = await ensureConnection();
    
    await new Promise<void>((resolve, reject) => {
      database.run(`
        CREATE TABLE migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        )
      `, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    await new Promise<void>((resolve, reject) => {
      database.run(`
        CREATE TABLE cached_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log('Database successfully reset');
    return true;
  } catch (error) {
    console.error('Error resetting database:', error);
    return false;
  }
}

/**
 * Attempt to repair database issues
 * This performs several levels of repair depending on the severity of the issues
 */
export async function repairDatabase(): Promise<boolean> {
  try {
    console.log("Starting database repair...");
    
    // First, make a backup
    const backupPath = await backupDatabase();
    if (backupPath) {
      console.log(`Created backup at ${backupPath}`);
    } else {
      console.warn("Could not create backup before repair");
    }
    
    // Check if database is accessible at all
    try {
      const database = await ensureConnection();
      
      // Try to run a simple query to see if it's functioning
      await new Promise<void>((resolve, reject) => {
        database.get("SELECT 1", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Check integrity
      const integrityResult = await checkDatabaseIntegrity();
      
      if (integrityResult.isValid) {
        console.log("Database appears to be intact, no repair needed");
        return true;
      }
      
      console.log("Found database integrity issues:", integrityResult.errors);
      
      // Try to fix by recreating the structure
      const recreateResult = await recreateDatabaseStructure();
      if (recreateResult) {
        console.log("Successfully repaired database by recreating structure");
        return true;
      }
      
      console.log("Structure recreation failed, database may need to be reset");
      return false;
    } catch (accessError) {
      console.error("Cannot access database for repair:", accessError);
      
      // If we can't even access the database, we might need to reset it completely
      console.log("Database is inaccessible, recommend a complete reset");
      return false;
    }
  } catch (error) {
    console.error("Error during database repair:", error);
    return false;
  }
} 