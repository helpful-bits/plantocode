// Server-side only database connection
import { setupDatabase } from './setup';
import { sessionRepository, backgroundJobRepository } from './repositories';
import { Session } from '@core/types';
import connectionPool from "./connection-pool";
import { ensureDbPermissions } from './connection-manager';
import crypto from 'crypto';
import { closeDatabase } from './connection-close';
import { getCachedState, saveCachedState } from './cache-state';
import { runMigrations } from './setup/migrations';
import { APP_DATA_DIR, DB_FILE } from './constants';
import fs from 'fs';
import Database from 'better-sqlite3';
import { DatabaseError, DatabaseErrorCategory, DatabaseErrorSeverity } from './database-errors';

// Export to check if we're on the server vs browser
export const isServer = typeof window === 'undefined';

// Create the app directory if it doesn't exist
if (isServer && !fs.existsSync(APP_DATA_DIR)) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

/**
 * Get a database connection from the pool
 * Only for backward compatibility - prefer withDb, withConnection, or withTransaction
 * @deprecated Use connectionPool.withConnection or withDb instead
 */
export const getDbConnection = () => connectionPool.getConnection();

/**
 * Direct db export for backward compatibility
 * @deprecated Use connectionPool.withConnection or withDb instead
 */
export const db = getDbConnection();

/**
 * Initialize the database with proper permissions and structure
 * @param forceRecovery Whether to force recovery mode during setup
 * @returns Whether initialization was successful
 */
export async function initializeDatabase(forceRecovery: boolean = false): Promise<boolean> {
  if (!isServer) return true; // No-op on client side
  
  try {
    // Ensure database permissions
    await ensureDbPermissions();
    
    // Initialize database structure
    await setupDatabase(forceRecovery);
    
    console.log("[DB] Successfully initialized database");
    return true;
  } catch (error) {
    const dbError = error instanceof DatabaseError 
      ? error 
      : new DatabaseError(
          `Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`,
          {
            originalError: error,
            severity: DatabaseErrorSeverity.CRITICAL,
            category: DatabaseErrorCategory.CONNECTION,
            reportToUser: true
          }
        );
    
    console.error("[DB] Error initializing database:", dbError.toString());
    return false;
  }
}

/**
 * Ensures that a database connection is available
 * Used by integrity checks and other utilities
 *
 * IMPORTANT: This function returns a raw connection that must be manually released.
 * Consider using connectionPool.withConnection() instead, which properly manages connection lifecycle.
 *
 * @param readOnly Optional parameter to request a readonly connection (defaults to false)
 * @returns A database connection that must be manually released after use
 */
export async function ensureConnection(readOnly: boolean = false) {
  try {
    // Return a connection with the specified mode
    return connectionPool.getConnection(readOnly);
  } catch (error) {
    const dbError = error instanceof DatabaseError 
      ? error 
      : new DatabaseError(
          `Failed to ensure database connection: ${error instanceof Error ? error.message : String(error)}`,
          {
            originalError: error,
            severity: DatabaseErrorSeverity.CRITICAL,
            category: DatabaseErrorCategory.CONNECTION
          }
        );
    
    console.error("[DB] Error ensuring database connection:", dbError.toString());

    // Try fixing permissions if we need a writable connection
    if (!readOnly) {
      console.log("[DB] Attempting to fix database permissions...");
      await ensureDbPermissions();

      // Retry after fixing permissions
      try {
        const conn = connectionPool.getConnection(false);
        console.log("[DB] Successfully got writable connection after fixing permissions");
        return conn;
      } catch (retryError) {
        const retryDbError = retryError instanceof DatabaseError 
          ? retryError 
          : new DatabaseError(
              `Failed to get writable connection after fixing permissions: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
              {
                originalError: retryError,
                severity: DatabaseErrorSeverity.CRITICAL,
                category: DatabaseErrorCategory.CONNECTION,
                reportToUser: true
              }
            );
            
        console.error("[DB] Failed to get writable connection even after fixing permissions:", retryDbError.toString());
        throw retryDbError;
      }
    } else {
      // For readonly connections, just rethrow the error
      throw dbError;
    }
  }
}

/**
 * Get a session with its background jobs
 * @param sessionId The ID of the session to retrieve
 * @returns The session with background jobs, or null if not found
 */
export async function getSessionWithBackgroundJobs(sessionId: string): Promise<Session | null> {
  try {
    return await sessionRepository.getSessionWithBackgroundJobs(sessionId);
  } catch (error) {
    const dbError = error instanceof DatabaseError 
      ? error 
      : new DatabaseError(
          `Failed to get session with background jobs: ${error instanceof Error ? error.message : String(error)}`,
          {
            originalError: error,
            severity: DatabaseErrorSeverity.WARNING,
            category: DatabaseErrorCategory.QUERY,
            context: { sessionId }
          }
        );
        
    console.error("[DB] Error getting session with background jobs:", dbError.toString());
    return null;
  }
}

/**
 * Get the active session ID for a project directory
 * @param projectDirectory The project directory to get the active session for
 * @returns The active session ID, or null if not found
 */
export async function getActiveSessionId(projectDirectory: string): Promise<string | null> {
  try {
    if (!projectDirectory) {
      console.error("[DB] Cannot get active session ID with empty project directory");
      return null;
    }

    // Convert project directory to consistent format
    projectDirectory = projectDirectory.trim();

    // hash the project directory for lookup
    const projectHash = hashString(projectDirectory);

    return await connectionPool.withConnection((db: Database.Database) => {
      // Check if key_value_store table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='key_value_store'")
                        .get();

      if (!tableExists) {
        return null;
      }

      // Get active session ID using the key pattern
      const key = `activeSession:${projectHash}`;
      const row = db.prepare('SELECT value FROM key_value_store WHERE key = ?')
                .get(key) as { value: string | null } | undefined;

      return row && row.value ? row.value : null;
    }, true); // Read-only operation
  } catch (error) {
    const dbError = error instanceof DatabaseError 
      ? error 
      : new DatabaseError(
          `Failed to get active session ID: ${error instanceof Error ? error.message : String(error)}`,
          {
            originalError: error,
            severity: DatabaseErrorSeverity.WARNING,
            category: DatabaseErrorCategory.QUERY,
            context: { projectDirectory }
          }
        );
        
    console.error("[DB] Error getting active session ID:", dbError.toString());
    return null;
  }
}

/**
 * Set or clear the active session for a project directory
 * @param projectDirectory The project directory to set the active session for
 * @param sessionId The session ID to set as active, or null to clear
 */
export async function setActiveSession(projectDirectory: string, sessionId: string | null): Promise<void> {
  try {
    if (!projectDirectory) {
      console.error("[DB] Cannot set active session with empty project directory");
      return;
    }

    // Convert project directory to consistent format
    projectDirectory = projectDirectory.trim();

    // hash the project directory for storage
    const projectHash = hashString(projectDirectory);

    await connectionPool.withConnection((db: Database.Database) => {
      // Check if table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='key_value_store'")
                          .get();

      // Create table if it doesn't exist
      if (!tableExists) {
        db.prepare(`
          CREATE TABLE key_value_store (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at INTEGER NOT NULL
          )
        `).run();

        // Create index for the key column
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_key_value_store_key ON key_value_store(key)`).run();
      }

      const key = `activeSession:${projectHash}`;

      if (sessionId) {
        // Set active session
        db.prepare(`
          INSERT OR REPLACE INTO key_value_store
          (key, value, updated_at)
          VALUES (?, ?, ?)
        `).run(
          key,
          sessionId,
          Date.now()
        );
      } else {
        // Clear active session
        db.prepare('DELETE FROM key_value_store WHERE key = ?')
          .run(key);
      }

      return;
    });
  } catch (error) {
    const dbError = error instanceof DatabaseError 
      ? error 
      : new DatabaseError(
          `Failed to set active session: ${error instanceof Error ? error.message : String(error)}`,
          {
            originalError: error,
            severity: DatabaseErrorSeverity.WARNING,
            category: DatabaseErrorCategory.QUERY,
            context: { projectDirectory, sessionId }
          }
        );
        
    console.error("[DB] Error setting active session:", dbError.toString());
    throw dbError;
  }
}

/**
 * Import and export repositories for use in other modules
 * RepositoryFactory allows for creating custom repositories
 */
import { RepositoryFactory, repositories } from './repositories/repository-factory';

/**
 * Execute a database operation safely with proper connection handling
 * @param operation Function that receives a database connection and returns a result
 * @param readOnly Whether to use a read-only connection (default: true)
 * @returns The result of the operation
 */
export async function withDb<T>(operation: (db: Database.Database) => T, readOnly: boolean = true): Promise<T> {
  return connectionPool.withConnection(operation, readOnly);
}

/**
 * Execute a database operation within a transaction
 * @param operation Function that receives a database connection and returns a result
 * @returns The result of the operation
 */
export async function withTransaction<T>(operation: (db: Database.Database) => T): Promise<T> {
  return connectionPool.withTransaction(operation);
}

/**
 * Create a hash of a string (for project directory hashing)
 * @param str The string to hash
 * @returns The hashed string
 */
export function hashString(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Initialize database on server startup
if (isServer) {
  initializeDatabase().catch(err => {
    console.error("[DB] Failed to initialize database:", err);
  });
}

// Export everything needed by other modules in a clean, organized way
export {
  // Core database functionality
  connectionPool,
  closeDatabase,
  setupDatabase,
  ensureDbPermissions,
  runMigrations,
  
  // Repositories
  sessionRepository,
  backgroundJobRepository,
  RepositoryFactory,
  repositories,
  
  // Constants and paths
  DB_FILE,
  APP_DATA_DIR,
  
  // Cache state management
  getCachedState,
  saveCachedState,
  
  // Error types (from database-errors.ts)
  DatabaseError,
  DatabaseErrorCategory,
  DatabaseErrorSeverity
};