// Only run database setup on the server
const isServer = typeof window === 'undefined';

// Only import databases modules when on server
import { db, closeDatabase, ensureConnection } from './index';
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
  
  // Ensure database connection is open
  const database = await ensureConnection();
  
  return new Promise<void>((resolve, reject) => {
    // Create transaction to ensure database is writable
    database.run("BEGIN TRANSACTION", (err: Error | null) => {
      if (err) {
        console.error("Error starting minimal database transaction:", err);
        reject(err);
        return;
      }
      
      // Try to create the migrations table if it doesn't exist
      database.run(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        )
      `, (err: Error | null) => {
        if (err) {
          console.error("Error creating migrations table:", err);
          database.run("ROLLBACK", () => reject(err));
          return;
        }
        
        // Create a minimal version of the meta table for configuration
        database.run(`
          CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY, 
            value TEXT NOT NULL
          )
        `, (err: Error | null) => {
          if (err) {
            console.error("Error creating meta table:", err);
            database.run("ROLLBACK", () => reject(err));
            return;
          }
          
          // Create diagnostic logs table for tracking errors
          database.run(`
            CREATE TABLE IF NOT EXISTS db_diagnostic_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              timestamp INTEGER NOT NULL,
              error_type TEXT NOT NULL,
              error_message TEXT NOT NULL,
              stack_trace TEXT,
              additional_info TEXT
            )
          `, (err: Error | null) => {
            if (err) {
              console.error("Error creating diagnostic logs table:", err);
              database.run("ROLLBACK", () => reject(err));
              return;
            }
            
            // Set recovery flag in meta table
            database.run(`
              INSERT OR REPLACE INTO meta (key, value) 
              VALUES ('recovery_mode', 'true'), ('recovery_timestamp', ?)
            `, [Date.now()], (err: Error | null) => {
              if (err) {
                console.error("Error setting recovery mode:", err);
                database.run("ROLLBACK", () => reject(err));
                return;
              }
              
              // Commit transaction
              database.run("COMMIT", (err: Error | null) => {
                if (err) {
                  console.error("Error committing minimal database transaction:", err);
                  database.run("ROLLBACK", () => reject(err));
                  return;
                }
                
                console.log("Created minimal recovery database successfully");
                resolve();
              });
            });
          });
        });
      });
    });
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
    const database = await ensureConnection();
    
    // Create the diagnostic logs table if it doesn't exist
    await new Promise<void>((resolve, reject) => {
      database.run(`
        CREATE TABLE IF NOT EXISTS db_diagnostic_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          error_type TEXT NOT NULL,
          error_message TEXT NOT NULL,
          stack_trace TEXT,
          additional_info TEXT
        )
      `, (err: Error | null) => {
        if (err) {
          console.error("Failed to create diagnostic logs table:", err);
          resolve(); // Continue even if this fails
        } else {
          resolve();
        }
      });
    });
    
    // Log the error
    await new Promise<void>((resolve, reject) => {
      database.run(`
        INSERT INTO db_diagnostic_logs (timestamp, error_type, error_message, stack_trace, additional_info)
        VALUES (?, ?, ?, ?, ?)
      `, [
        Date.now(),
        errorType,
        errorMessage,
        stackTrace || null,
        additionalInfo || null
      ], (err: Error | null) => {
        if (err) {
          console.error("Failed to log database error:", err);
        }
        resolve(); // Always resolve to continue the flow
      });
    });
  } catch (err) {
    console.error("Error logging database diagnostic:", err);
  }
}

/**
 * Initialize the database
 * @param forceRecoveryMode If true, will attempt to create a minimal database even if initialization fails
 */
export async function setupDatabase(forceRecoveryMode: boolean = false): Promise<DBSetupResult> {
  // Skip execution on client-side
  if (!isServer) return dummyPromise();
  
  try {
    // Ensure the app directory exists
    if (!fs.existsSync(APP_DATA_DIR)) {
      fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    }
    
    // Make sure the database connection is open and valid
    const database = await ensureConnection();
    
    // Validate database by running a simple query
    await validateDatabaseConnection();
    
    console.log("Database connection established");
    
    // Check if migrations table exists (but don't run migrations automatically)
    const migrationsExist = await new Promise<boolean>((resolve) => {
      database.get(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='migrations'
      `, (err: Error | null, row: any) => {
        if (err || !row) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
    
    if (!migrationsExist) {
      console.warn("Migrations table does not exist. Please run migrations manually with 'pnpm migrate'");
    }
    
    // Fix permissions immediately after ensuring connection
    await fixDatabasePermissions();
    
    return {
      success: true,
      message: "Database setup complete. Run migrations manually if needed."
    };
  } catch (error) {
    console.error("Database setup error:", error);
    
    // Log the error
    try {
      await logDatabaseError(
        "setup_failure",
        error instanceof Error ? error.message : "Unknown setup error",
        error instanceof Error ? error.stack : undefined
      );
    } catch (logError) {
      console.error("Failed to log database error:", logError);
    }
    
    if (forceRecoveryMode) {
      console.warn("Attempting recovery mode due to setup failure");
      try {
        await createMinimalDatabase();
        return {
          success: true,
          message: "Database initialized in recovery mode. Limited functionality available.",
          recoveryMode: true
        };
      } catch (recoveryError) {
        console.error("Failed to create recovery database:", recoveryError);
        return {
          success: false,
          message: "Failed to initialize database even in recovery mode.",
          error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
        };
      }
    }
    
    return {
      success: false,
      message: "Failed to initialize database.",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Validates database connection by running a simple query
 */
async function validateDatabaseConnection(): Promise<boolean> {
  try {
    const database = await ensureConnection();
    
    return new Promise<boolean>((resolve, reject) => {
      database.get('SELECT 1 as value', (err: Error | null, row: any) => {
        if (err) {
          console.error("Database validation failed:", err);
          reject(new Error(`Database validation failed: ${err.message}`));
          return;
        }
        
        if (!row || row.value !== 1) {
          console.error("Database validation failed: unexpected result");
          reject(new Error("Database validation failed: unexpected result"));
          return;
        }
        
        resolve(true);
      });
    });
  } catch (error) {
    console.error("Error validating database:", error);
    throw error;
  }
}

/**
 * Run database migrations
 * IMPORTANT: This should be run manually, not automatically
 */
export async function runMigrations(): Promise<void> {
  console.log("RUNNING MIGRATIONS MANUALLY - This must be done explicitly after installation or updates");
  const database = await ensureConnection();
  
  // Create migrations table if it doesn't exist
  await new Promise<void>((resolve, reject) => {
    database.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `, (err: Error | null) => {
      if (err) {
        console.error("Error creating migrations table:", err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
  
  // Get list of migrations that have already been applied
  const appliedMigrations = await new Promise<string[]>((resolve, reject) => {
    database.all("SELECT name FROM migrations ORDER BY id", (err: Error | null, rows: any[]) => {
      if (err) {
        console.error("Error getting applied migrations:", err);
        reject(err);
      } else {
        resolve(rows.map(row => row.name));
      }
    });
  });
  
  // Get migration files from the migrations directory
  const migrationsDir = path.join(__dirname, '../../migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log("No migrations directory found.");
    return;
  }
  
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort to ensure migrations run in order
  
  console.log(`Found ${migrationFiles.length} migration files, ${appliedMigrations.length} already applied`);
  
  // Apply each migration that hasn't been run yet
  for (const file of migrationFiles) {
    if (appliedMigrations.includes(file)) {
      // Skip migrations that have already been applied
      console.log(`Skipping already applied migration: ${file}`);
      continue;
    }
    
    console.log(`Applying migration: ${file}`);
    
    try {
      // Read the migration file
      const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      // Begin a transaction for this migration
      await new Promise<void>((resolve, reject) => {
        database.run("BEGIN TRANSACTION", (err: Error | null) => {
          if (err) {
            console.error(`Error starting transaction for ${file}:`, err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      // Execute the migration
      await new Promise<void>((resolve, reject) => {
        database.exec(migration, (err: Error | null) => {
          if (err) {
            console.error(`Error executing migration ${file}:`, err);
            
            // Rollback the transaction
            database.run("ROLLBACK", () => {
              reject(err);
            });
          } else {
            resolve();
          }
        });
      });
      
      // Record the migration as applied
      await new Promise<void>((resolve, reject) => {
        database.run(
          "INSERT INTO migrations (name, applied_at) VALUES (?, ?)",
          [file, Date.now()],
          (err: Error | null) => {
            if (err) {
              console.error(`Error recording migration ${file}:`, err);
              
              // Rollback the transaction
              database.run("ROLLBACK", () => {
                reject(err);
              });
            } else {
              resolve();
            }
          }
        );
      });
      
      // Commit the transaction
      await new Promise<void>((resolve, reject) => {
        database.run("COMMIT", (err: Error | null) => {
          if (err) {
            console.error(`Error committing migration ${file}:`, err);
            
            // Try to rollback
            database.run("ROLLBACK", () => {
              reject(err);
            });
          } else {
            console.log(`Successfully applied migration: ${file}`);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error(`Migration '${file}' failed:`, error);
      throw error;
    }
  }
  
  console.log("All migrations have been applied successfully");
}

/**
 * Reset the database (completely removes and recreates it)
 * WARNING: This will delete all data
 */
export async function resetDatabase(): Promise<void> {
  // Close any open database connections
  try {
    await closeDatabase();
  } catch (err) {
    console.warn("Error closing database connection:", err);
  }
  
  // Backup the current database if it exists
  if (fs.existsSync(DB_FILE)) {
    const backupFile = `${DB_FILE}.backup-${Date.now()}`;
    try {
      fs.copyFileSync(DB_FILE, backupFile);
      console.log(`Backed up database to ${backupFile}`);
      
      // Also set proper permissions on the backup file
      try {
        fs.chmodSync(backupFile, 0o666); // rw-rw-rw-
      } catch (permErr) {
        console.warn("Failed to set permissions on backup file:", permErr);
      }
    } catch (err) {
      console.error("Failed to backup database:", err);
    }
    
    // Delete the database file
    try {
      fs.unlinkSync(DB_FILE);
      console.log("Deleted existing database file");
    } catch (err) {
      console.error("Failed to delete database file:", err);
      throw err;
    }
  }
  
  // Set up a new database
  await setupDatabase();
  
  // Ensure proper permissions after setting up
  await fixDatabasePermissions();
  
  // Run migrations
  await runMigrations();
  
  console.log("Database has been reset and migrations applied.");
}

/**
 * Get information about the database
 */
export async function getDatabaseInfo(): Promise<any> {
  try {
    const database = await ensureConnection();
    
    // Get SQLite version
    const versionInfo = await new Promise((resolve, reject) => {
      database.get("SELECT sqlite_version() as version", (err: Error | null, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
    
    // Get table count
    const tableCount = await new Promise((resolve, reject) => {
      database.get(
        "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        (err: Error | null, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.count);
          }
        }
      );
    });
    
    // Get applied migrations
    const migrations = await new Promise((resolve, reject) => {
      database.all(
        "SELECT name, applied_at FROM migrations ORDER BY id DESC LIMIT 5",
        (err: Error | null, rows: any[]) => {
          if (err) {
            // Table might not exist yet
            resolve([]);
          } else {
            resolve(rows);
          }
        }
      );
    });
    
    return {
      version: versionInfo.version,
      tableCount,
      recentMigrations: migrations,
      databasePath: DB_FILE,
      databaseSize: fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0,
    };
  } catch (error) {
    console.error("Error getting database info:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
