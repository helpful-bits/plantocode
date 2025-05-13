import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { connectionPool, closeDatabase } from './index';
import { APP_DATA_DIR, DB_FILE } from './constants';
import { DatabaseError, DatabaseErrorCategory, DatabaseErrorSeverity, dispatchDatabaseErrorEvent } from './database-errors';

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

const BACKUP_DIR = path.join(APP_DATA_DIR, 'backups');

/**
 * Integrity check result types indicating different levels of database health
 */
export enum IntegrityResultType {
  /** Database is completely healthy */
  HEALTHY = 'healthy',
  
  /** Database has minor issues that don't prevent operation */
  DEGRADED = 'degraded',
  
  /** Database is corrupted but still partially usable */
  CRITICAL = 'critical',
  
  /** Database is completely corrupted and unusable */
  FATAL = 'fatal'
}

/**
 * Integrity check result returned from various check functions
 */
export interface IntegrityResult {
  /** Whether the database passes integrity checks */
  isValid: boolean;
  
  /** Error messages from failed checks */
  errors: string[];
  
  /** Level of database health */
  type: IntegrityResultType;
  
  /** Additional check details */
  details?: any;
  
  /** Repair recommendations based on the check */
  recommendations?: string[];
  
  /** Timestamp when the check was performed */
  timestamp: number;
}

/**
 * Recovery options for database integrity issues
 */
export interface RecoveryOptions {
  /** Whether to automatically create a backup before repair */
  createBackup?: boolean;
  
  /** Whether to attempt vacuum during repair */
  attemptVacuum?: boolean;
  
  /** Whether to recreate database structure as last resort */
  allowRecreateStructure?: boolean;
  
  /** Whether to force reset the database as last resort (all data lost) */
  allowResetDatabase?: boolean;
  
  /** Whether to attempt to recover data from corrupt tables */
  attemptDataRecovery?: boolean;
}

/**
 * Default recovery options
 */
const DEFAULT_RECOVERY_OPTIONS: RecoveryOptions = {
  createBackup: true,
  attemptVacuum: true,
  allowRecreateStructure: false,
  allowResetDatabase: false,
  attemptDataRecovery: true
};

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
    const backupFile = path.join(backupsDir, `vibe-manager-${timestamp}.db`);
    
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
    const dbError = DatabaseError.fromError(error, {
      severity: DatabaseErrorSeverity.WARNING,
      category: DatabaseErrorCategory.OTHER,
      context: { operation: 'backupDatabase' }
    });
    
    console.error(`Error creating database backup: ${dbError.toString()}`);
    return null;
  }
}

/**
 * Check database integrity using SQLite's integrity_check pragma
 * @param level The level of integrity check to perform
 * @returns Integrity check result
 */
export async function checkDatabaseIntegrity(level: 'quick' | 'normal' | 'full' = 'normal'): Promise<IntegrityResult> {
  try {
    const now = Date.now();
    const result = await connectionPool.withConnection((db: Database.Database) => {
      const errors: string[] = [];
      const recommendations: string[] = [];
      
      // Get the appropriate integrity check pragma based on level
      let integrityPragma: string;
      switch (level) {
        case 'quick':
          integrityPragma = 'quick_check';
          break;
        case 'full':
          integrityPragma = 'integrity_check(100)'; // Check up to 100 errors
          break;
        case 'normal':
        default:
          integrityPragma = 'integrity_check';
          break;
      }
      
      // Run SQLite integrity check
      const integrityResults = db.pragma(integrityPragma);
      
      // Determine if integrity check passed
      let isIntegrityOk = false;
      
      if (Array.isArray(integrityResults)) {
        isIntegrityOk = integrityResults.length === 1 && 
                      ((integrityResults[0].integrity_check === 'ok') || 
                       (integrityResults[0].quick_check === 'ok'));
      } else if (typeof integrityResults === 'string') {
        isIntegrityOk = integrityResults === 'ok';
      }
      
      // Collect error messages from failed integrity check
      if (!isIntegrityOk) {
        errors.push('Database integrity check failed');
        
        if (Array.isArray(integrityResults)) {
          integrityResults.forEach((row: any) => {
            // Extract the error message regardless of which check was run
            const errorMsg = row.integrity_check || row.quick_check;
            if (errorMsg && errorMsg !== 'ok') {
              errors.push(errorMsg);
            }
          });
        } else if (typeof integrityResults === 'string' && integrityResults !== 'ok') {
          errors.push(integrityResults);
        }
        
        // Generate recommendations
        recommendations.push('Backup your database before attempting repairs');
        recommendations.push('Try running VACUUM to compact the database');
        
        if (errors.some(e => e.includes('database disk image is malformed'))) {
          recommendations.push('Database appears to be corrupted, consider restoring from a backup');
        }
      }
      
      // Check foreign key constraints
      const foreignKeyCheck = db.pragma('foreign_key_check');
      
      if (Array.isArray(foreignKeyCheck) && foreignKeyCheck.length > 0) {
        errors.push('Foreign key constraint violations found');
        foreignKeyCheck.forEach((violation: any) => {
          errors.push(`Table ${violation.table}, rowid ${violation.rowid}, parent ${violation.parent}`);
        });
        
        recommendations.push('Foreign key constraints are violated, consider fixing data consistency');
      }
      
      // Perform a schema check to verify all tables have the expected structure
      try {
        const tables = db.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `).all().map((row: any) => row.name);
        
        // Check for empty schema (no tables)
        if (tables.length === 0) {
          errors.push('Database has no tables');
          recommendations.push('Database appears to be empty, consider initialization or restoration');
        }
        
        // Check for essential tables
        const essentialTables = ['sessions', 'background_jobs', 'migrations'];
        const missingTables = essentialTables.filter(table => !tables.includes(table));
        
        if (missingTables.length > 0) {
          errors.push(`Missing essential tables: ${missingTables.join(', ')}`);
          recommendations.push('Essential tables are missing, consider recreating database structure');
        }
      } catch (schemaErr) {
        errors.push(`Schema check failed: ${schemaErr instanceof Error ? schemaErr.message : String(schemaErr)}`);
      }
      
      // Determine the integrity result type based on the errors
      let resultType = IntegrityResultType.HEALTHY;
      
      if (errors.length > 0) {
        // Check for fatal corruption indicators
        const hasFatalCorruption = errors.some(e => 
          e.includes('database disk image is malformed') || 
          e.includes('file is not a database') ||
          e.includes('SQLite: Corrupt')
        );
        
        if (hasFatalCorruption) {
          resultType = IntegrityResultType.FATAL;
        } else if (errors.some(e => e.includes('database is malformed'))) {
          resultType = IntegrityResultType.CRITICAL;
        } else {
          // Only constraint or minor errors
          resultType = IntegrityResultType.DEGRADED;
        }
      }
      
      return {
        isValid: isIntegrityOk && (!Array.isArray(foreignKeyCheck) || foreignKeyCheck.length === 0),
        errors,
        type: resultType,
        recommendations,
        details: {
          integrityCheck: integrityResults,
          foreignKeyCheck,
          level
        },
        timestamp: now
      };
    }, true); // Use readonly connection
    
    // If integrity check failed, report it to the UI for critical/fatal issues
    if (!result.isValid && 
        (result.type === IntegrityResultType.CRITICAL || 
         result.type === IntegrityResultType.FATAL)) {
      const dbError = new DatabaseError(
        `Database integrity check failed: ${result.errors[0]}`, {
          severity: result.type === IntegrityResultType.FATAL 
            ? DatabaseErrorSeverity.FATAL 
            : DatabaseErrorSeverity.CRITICAL,
          category: DatabaseErrorCategory.INTEGRITY,
          context: { 
            integrityResult: result,
            checkLevel: level
          },
          reportToUser: true
        }
      );
      
      dispatchDatabaseErrorEvent(dbError);
    }
    
    return result;
  } catch (error) {
    const dbError = DatabaseError.fromError(error, {
      severity: DatabaseErrorSeverity.CRITICAL,
      category: DatabaseErrorCategory.INTEGRITY,
      context: { checkLevel: level }
    });
    
    console.error(`Error checking database integrity: ${dbError.toString()}`);
    return {
      isValid: false,
      errors: [`Error checking integrity: ${dbError.message}`],
      type: IntegrityResultType.CRITICAL,
      recommendations: [
        'Database check failed to complete, consider recreating the database'
      ],
      timestamp: Date.now()
    };
  }
}

/**
 * Performs integrity checking and attempts recovery based on the results
 * Implements gradual degradation with progressive repair attempts
 * @param options Recovery options to control repair behavior
 * @returns Result of the recovery attempt
 */
export async function checkAndRecoverDatabase(
  options: RecoveryOptions = DEFAULT_RECOVERY_OPTIONS
): Promise<{
  success: boolean;
  actions: string[];
  originalIntegrity: IntegrityResult;
  finalIntegrity?: IntegrityResult;
  backupPath?: string | null;
}> {
  const opts = { ...DEFAULT_RECOVERY_OPTIONS, ...options };
  const actions: string[] = [];
  let backupPath: string | null = null;
  
  try {
    // Step 1: Create backup if requested
    if (opts.createBackup) {
      actions.push('Attempting database backup');
      backupPath = await backupDatabase();
      
      if (backupPath) {
        actions.push(`Created backup at ${backupPath}`);
      } else {
        actions.push('Failed to create backup');
      }
    }
    
    // Step 2: Perform initial integrity check
    actions.push('Performing initial integrity check');
    const initialCheckResult = await checkDatabaseIntegrity('normal');
    
    // If database is healthy, we're done
    if (initialCheckResult.isValid) {
      actions.push('Database integrity check passed, no recovery needed');
      return {
        success: true,
        actions,
        originalIntegrity: initialCheckResult,
        finalIntegrity: initialCheckResult,
        backupPath
      };
    }
    
    // Step 3: Begin recovery process with progressive steps
    actions.push(`Database has issues (type: ${initialCheckResult.type}): ${initialCheckResult.errors.length} errors found`);
    
    // Step 3a: For degraded databases, try VACUUM if requested
    if (initialCheckResult.type === IntegrityResultType.DEGRADED && opts.attemptVacuum) {
      actions.push('Attempting VACUUM to compact database');
      
      try {
        await connectionPool.withConnection((db: Database.Database) => {
          db.pragma('vacuum');
        }, false); // Need write access for VACUUM
        
        actions.push('VACUUM completed successfully');
        
        // Check if VACUUM fixed the issues
        const postVacuumCheck = await checkDatabaseIntegrity('normal');
        
        if (postVacuumCheck.isValid) {
          actions.push('Database integrity restored after VACUUM');
          return {
            success: true,
            actions,
            originalIntegrity: initialCheckResult,
            finalIntegrity: postVacuumCheck,
            backupPath
          };
        } else {
          actions.push('VACUUM did not fully resolve integrity issues');
        }
      } catch (vacuumError) {
        const dbError = DatabaseError.fromError(vacuumError);
        actions.push(`VACUUM failed: ${dbError.message}`);
      }
    }
    
    // Step 3b: For critical databases, try running external SQLite repair
    if ((initialCheckResult.type === IntegrityResultType.CRITICAL ||
         initialCheckResult.type === IntegrityResultType.DEGRADED)) {
      
      actions.push('Attempting SQLite CLI repair');
      
      try {
        // Close all connections to allow CLI access
        closeDatabase();
        
        const { stdout, stderr } = await execAsync(`sqlite3 "${DB_FILE}" "PRAGMA integrity_check; VACUUM;"`);
        
        if (stderr) {
          actions.push(`SQLite CLI error: ${stderr}`);
        } else {
          actions.push('SQLite CLI repair completed');
          
          if (stdout.includes('ok')) {
            actions.push('CLI repair appears successful');
            
            // Verify that repair worked
            const postCliCheck = await checkDatabaseIntegrity('normal');
            
            if (postCliCheck.isValid) {
              actions.push('Database integrity restored after CLI repair');
              return {
                success: true,
                actions,
                originalIntegrity: initialCheckResult,
                finalIntegrity: postCliCheck,
                backupPath
              };
            } else {
              actions.push('CLI repair did not fully resolve integrity issues');
            }
          } else {
            actions.push('CLI repair did not report success');
          }
        }
      } catch (cliError) {
        const dbError = DatabaseError.fromError(cliError);
        actions.push(`SQLite CLI repair failed: ${dbError.message}`);
      }
    }
    
    // Step 3c: If allowed, try recreating database structure while preserving data
    if (opts.allowRecreateStructure && 
       (initialCheckResult.type === IntegrityResultType.CRITICAL || 
        initialCheckResult.type === IntegrityResultType.DEGRADED)) {
      
      actions.push('Attempting to recreate database structure while preserving data');
      
      try {
        const recreateSuccess = await recreateDatabaseStructure();
        
        if (recreateSuccess) {
          actions.push('Successfully recreated database structure');
          
          // Verify structure recreation worked
          const postRecreateCheck = await checkDatabaseIntegrity('normal');
          
          if (postRecreateCheck.isValid) {
            actions.push('Database integrity restored after recreating structure');
            return {
              success: true,
              actions,
              originalIntegrity: initialCheckResult,
              finalIntegrity: postRecreateCheck,
              backupPath
            };
          } else {
            actions.push('Structure recreation did not fully resolve integrity issues');
          }
        } else {
          actions.push('Failed to recreate database structure');
        }
      } catch (recreateError) {
        const dbError = DatabaseError.fromError(recreateError);
        actions.push(`Structure recreation failed: ${dbError.message}`);
      }
    }
    
    // Step 3d: Last resort - completely reset database if allowed
    if (opts.allowResetDatabase && 
       (initialCheckResult.type === IntegrityResultType.FATAL || 
        initialCheckResult.type === IntegrityResultType.CRITICAL)) {
      
      actions.push('Attempting complete database reset (all data will be lost)');
      
      try {
        const resetSuccess = await resetDatabase();
        
        if (resetSuccess) {
          actions.push('Successfully reset database');
          
          // No need to check integrity after reset - we know it's a fresh DB
          return {
            success: true,
            actions,
            originalIntegrity: initialCheckResult,
            finalIntegrity: {
              isValid: true,
              errors: [],
              type: IntegrityResultType.HEALTHY,
              details: { reset: true },
              timestamp: Date.now()
            },
            backupPath
          };
        } else {
          actions.push('Failed to reset database');
        }
      } catch (resetError) {
        const dbError = DatabaseError.fromError(resetError);
        actions.push(`Database reset failed: ${dbError.message}`);
      }
    }
    
    // Step 4: Final integrity check after all recovery attempts
    actions.push('Performing final integrity check');
    const finalCheckResult = await checkDatabaseIntegrity('normal');
    
    const success = finalCheckResult.isValid || 
                  (finalCheckResult.type === IntegrityResultType.DEGRADED && 
                   initialCheckResult.type === IntegrityResultType.CRITICAL);
    
    // If we reached here, our recovery was either successful or unsuccessful
    if (success) {
      actions.push('Recovery completed with some improvement');
    } else {
      actions.push('Recovery completed but integrity issues remain');
    }
    
    return {
      success,
      actions,
      originalIntegrity: initialCheckResult,
      finalIntegrity: finalCheckResult,
      backupPath
    };
  } catch (error) {
    const dbError = DatabaseError.fromError(error, {
      severity: DatabaseErrorSeverity.CRITICAL,
      category: DatabaseErrorCategory.INTEGRITY
    });
    
    console.error(`Error in database recovery process: ${dbError.toString()}`);
    
    actions.push(`Recovery process error: ${dbError.message}`);
    
    return {
      success: false,
      actions,
      originalIntegrity: {
        isValid: false,
        errors: [`Recovery process error: ${dbError.message}`],
        type: IntegrityResultType.CRITICAL,
        timestamp: Date.now()
      },
      backupPath
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
          db.prepare('CREATE TEMPORARY TABLE temp_key_value_store AS SELECT * FROM key_value_store').run();
        } catch (err) {
          // Ignore errors if table doesn't exist
          console.log("Failed to backup key_value_store table:", err);
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
          CREATE TABLE key_value_store (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at INTEGER NOT NULL
          )
        `).run();

        db.prepare(`CREATE INDEX IF NOT EXISTS idx_key_value_store_key ON key_value_store(key)`).run();
        
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
          db.prepare('INSERT INTO key_value_store SELECT * FROM temp_key_value_store').run();
        } catch (err) {
          console.log("Failed to restore key_value_store:", err);
        }
        
        return true;
      } catch (error) {
        console.error("Error recreating database structure:", error);
        throw error; // Will trigger transaction rollback
      }
    });
  } catch (error) {
    const dbError = DatabaseError.fromError(error, {
      severity: DatabaseErrorSeverity.CRITICAL,
      category: DatabaseErrorCategory.INTEGRITY
    });
    
    console.error(`Error recreating database structure: ${dbError.toString()}`);
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
    const dbError = DatabaseError.fromError(error, {
      severity: DatabaseErrorSeverity.CRITICAL,
      category: DatabaseErrorCategory.INTEGRITY
    });
    
    console.error(`Error resetting database: ${dbError.toString()}`);
    return false;
  }
}

/**
 * Attempt to repair a corrupted database
 * @deprecated Use checkAndRecoverDatabase instead for a more comprehensive approach
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
    const dbError = DatabaseError.fromError(error, {
      severity: DatabaseErrorSeverity.CRITICAL,
      category: DatabaseErrorCategory.INTEGRITY
    });
    
    console.error(`Error repairing database: ${dbError.toString()}`);
    return false;
  }
}