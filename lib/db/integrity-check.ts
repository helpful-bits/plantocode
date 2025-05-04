import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { connectionPool, closeDatabase } from './index';
import { DB_FILE } from './constants';

// Create a simple exec wrapper without using promisify
const execAsync = (command: string): Promise<{stdout: string, stderr: string}> => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        // Ensure stdout and stderr are strings
        resolve({ 
          stdout: stdout.toString(), 
          stderr: stderr.toString() 
        });
      }
    });
  });
};

const APP_DATA_DIR = path.join(os.homedir(), '.o1-pro-flow');
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
      closeDatabase();
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
    return connectionPool.withConnection((db: Database.Database) => {
      const errors: string[] = [];
      
      // Run SQLite integrity check
      const integrityResults = db.pragma('integrity_check');
      
      // If there's only one row with "ok", the database is fine
      const isIntegrityOk = Array.isArray(integrityResults) && 
                           integrityResults.length === 1 && 
                           integrityResults[0].integrity_check === 'ok';
      
      if (!isIntegrityOk) {
        errors.push('Database integrity check failed');
        if (Array.isArray(integrityResults)) {
          integrityResults.forEach((row: any) => {
            if (row.integrity_check !== 'ok') {
              errors.push(row.integrity_check);
            }
          });
        } else if (typeof integrityResults === 'string' && integrityResults !== 'ok') {
          errors.push(integrityResults);
        }
      }
      
      // Check foreign key constraints
      const foreignKeyCheck = db.pragma('foreign_key_check');
      
      if (Array.isArray(foreignKeyCheck) && foreignKeyCheck.length > 0) {
        errors.push('Foreign key constraint violations found');
        foreignKeyCheck.forEach((violation: any) => {
          errors.push(`Table ${violation.table}, rowid ${violation.rowid}, parent ${violation.parent}`);
        });
      }
      
      return {
        isValid: isIntegrityOk && (!Array.isArray(foreignKeyCheck) || foreignKeyCheck.length === 0),
        errors,
        details: {
          integrityCheck: integrityResults,
          foreignKeyCheck
        }
      };
    }, true); // Use readonly connection
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
    
    return connectionPool.withTransaction((db: Database.Database) => {
      try {
        // Create temporary tables for data we want to preserve
        try {
          db.prepare('CREATE TEMPORARY TABLE temp_sessions AS SELECT * FROM sessions').run();
        } catch (err) {
          // Ignore errors if table doesn't exist
          console.log("Failed to backup sessions table:", err);
        }
        
        try {
          db.prepare('CREATE TEMPORARY TABLE temp_background_jobs AS SELECT * FROM background_jobs').run();
        } catch (err) {
          // Ignore errors if table doesn't exist
          console.log("Failed to backup background_jobs table:", err);
        }
        
        try {
          db.prepare('CREATE TEMPORARY TABLE temp_cached_state AS SELECT * FROM cached_state').run();
        } catch (err) {
          // Ignore errors if table doesn't exist
          console.log("Failed to backup cached_state table:", err);
        }
        
        try {
          db.prepare('CREATE TEMPORARY TABLE temp_active_sessions AS SELECT * FROM active_sessions').run();
        } catch (err) {
          // Ignore errors if table doesn't exist
          console.log("Failed to backup active_sessions table:", err);
        }
        
        // Drop all existing tables
        const tables = db.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name NOT LIKE 'temp_%' AND name NOT LIKE 'sqlite_%'
        `).all().map((row: any) => row.name);
        
        for (const table of tables) {
          db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
        }
        
        // Create essential tables
        db.prepare(`
          CREATE TABLE migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            applied_at INTEGER NOT NULL
          )
        `).run();
        
        db.prepare(`
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
        `).run();
        
        db.prepare(`
          CREATE TABLE background_jobs (
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
        
        db.prepare(`
          CREATE TABLE included_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            path TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
          )
        `).run();
        
        db.prepare(`
          CREATE TABLE excluded_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            path TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
          )
        `).run();
        
        db.prepare(`
          CREATE TABLE active_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_directory TEXT NOT NULL,
            project_hash TEXT NOT NULL UNIQUE,
            session_id TEXT,
            updated_at INTEGER NOT NULL
          )
        `).run();
        
        db.prepare(`
          CREATE TABLE cached_state (
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
        
        db.prepare(`
          CREATE TABLE meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `).run();
        
        // Try to restore data
        try {
          db.prepare('INSERT INTO sessions SELECT * FROM temp_sessions').run();
        } catch (err) {
          console.log("Failed to restore sessions:", err);
        }
        
        try {
          db.prepare('INSERT INTO background_jobs SELECT * FROM temp_background_jobs').run();
        } catch (err) {
          console.log("Failed to restore background_jobs:", err);
        }
        
        try {
          db.prepare('INSERT INTO cached_state SELECT * FROM temp_cached_state').run();
        } catch (err) {
          console.log("Failed to restore cached_state:", err);
        }
        
        try {
          db.prepare('INSERT INTO active_sessions SELECT * FROM temp_active_sessions').run();
        } catch (err) {
          console.log("Failed to restore active_sessions:", err);
        }
        
        return true;
      } catch (error) {
        console.error("Error recreating database structure:", error);
        throw error; // Will trigger transaction rollback
      }
    });
  } catch (error) {
    console.error('Error recreating database structure:', error);
    return false;
  }
}

/**
 * Complete reset of the database
 * WARNING: This will delete all data
 */
export async function resetDatabase(): Promise<boolean> {
  try {
    // First make a backup
    const backupPath = await backupDatabase();
    if (!backupPath) {
      console.error('Failed to create backup before resetting database');
      return false;
    }
    
    // Close all connections
    closeDatabase();
    
    // Delete the database file
    if (fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
      console.log('Database file deleted');
    }
    
    // Also delete WAL and SHM files if they exist
    const walFile = `${DB_FILE}-wal`;
    const shmFile = `${DB_FILE}-shm`;
    
    if (fs.existsSync(walFile)) {
      fs.unlinkSync(walFile);
      console.log('WAL file deleted');
    }
    
    if (fs.existsSync(shmFile)) {
      fs.unlinkSync(shmFile);
      console.log('SHM file deleted');
    }
    
    console.log('Database has been completely reset');
    return true;
  } catch (error) {
    console.error('Error resetting database:', error);
    return false;
  }
}

/**
 * Attempt to repair a corrupted database
 */
export async function repairDatabase(): Promise<boolean> {
  try {
    // First make a backup
    const backupPath = await backupDatabase();
    if (!backupPath) {
      console.error('Failed to create backup before repairing database');
      return false;
    }
    
    // Close all connections
    closeDatabase();
    
    // Attempt to recover using the sqlite3 command line tool
    try {
      const { stdout, stderr } = await execAsync(`sqlite3 "${DB_FILE}" "PRAGMA integrity_check; VACUUM;"`);
      
      if (stderr) {
        console.error('SQLite CLI error:', stderr);
        return false;
      }
      
      if (stdout.includes('ok')) {
        console.log('Database repaired successfully');
        return true;
      } else {
        console.error('SQLite integrity check failed after repair attempt:', stdout);
        return false;
      }
    } catch (execError) {
      console.error('Error executing SQLite CLI:', execError);
      
      // If CLI repair fails, try recreating the structure
      console.log('Attempting to recreate database structure...');
      return await recreateDatabaseStructure();
    }
  } catch (error) {
    console.error('Error repairing database:', error);
    return false;
  }
} 