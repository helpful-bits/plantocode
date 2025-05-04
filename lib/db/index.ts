// Server-side only database connection
import { setupDatabase } from './setup';
import { sessionRepository, backgroundJobRepository } from './repositories';
import { Session } from '@/types';
import connectionPool from "./connection-pool";
import { ensureDbPermissions } from './connection-manager';
import crypto from 'crypto';
import { closeDatabase } from './connection-close';
import { getCachedState, saveCachedState } from './cache-state';
import { runMigrations } from './setup/migrations';
import { APP_DATA_DIR, DB_FILE } from './constants';
import fs from 'fs';
import Database from 'better-sqlite3';

// Export to check if we're on the server vs browser
export const isServer = typeof window === 'undefined';

// Create the app directory if it doesn't exist
if (!fs.existsSync(APP_DATA_DIR)) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

// Export the database instance directly
export const db = connectionPool.getConnection();

/**
 * Initialize the database with proper permissions and structure
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
    console.error("[DB] Error initializing database:", error);
    return false;
  }
}

/**
 * Ensures that a database connection is available
 * Used by integrity checks and other utilities
 */
export async function ensureConnection() {
  try {
    // Return a writable connection
    return connectionPool.getConnection(false);
  } catch (error) {
    console.error("[DB] Error ensuring database connection:", error);
    
    // Try fixing permissions
    await ensureDbPermissions();
    
    // Retry after fixing permissions
    try {
      return connectionPool.getConnection(false);
    } catch (retryError) {
      console.error("[DB] Failed to get connection even after fixing permissions:", retryError);
      throw retryError;
    }
  }
}

/**
 * Get a session with its background jobs
 */
export async function getSessionWithRequests(sessionId: string): Promise<Session | null> {
  return sessionRepository.getSessionWithBackgroundJobs(sessionId);
}

/**
 * Get a session with its background jobs (alias for backward compatibility)
 */
export async function getSessionWithBackgroundJobs(sessionId: string): Promise<Session | null> {
  return sessionRepository.getSessionWithBackgroundJobs(sessionId);
}

/**
 * Get the active session ID for a project directory
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
      // Check if table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='active_sessions'")
                          .get();
      
      if (!tableExists) {
        return null;
      }
      
      // Get active session ID
      const row = db.prepare('SELECT session_id FROM active_sessions WHERE project_hash = ?')
                  .get(projectHash) as { session_id: string | null } | undefined;
      
      return row && row.session_id ? row.session_id : null;
    }, true); // Read-only operation
  } catch (error) {
    console.error("[DB] Error getting active session ID:", error);
    return null;
  }
}

/**
 * Set or clear the active session for a project directory
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
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='active_sessions'")
                            .get();
      
      // Create table if it doesn't exist
      if (!tableExists) {
        db.prepare(`
          CREATE TABLE active_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_directory TEXT NOT NULL,
            project_hash TEXT NOT NULL UNIQUE,
            session_id TEXT,
            updated_at INTEGER NOT NULL
          )
        `).run();
      }
      
      if (sessionId) {
        // Set active session
        db.prepare(`
          INSERT OR REPLACE INTO active_sessions 
          (project_directory, project_hash, session_id, updated_at) 
          VALUES (?, ?, ?, ?)
        `).run(
          projectDirectory,
          projectHash,
          sessionId,
          Date.now()
        );
      } else {
        // Clear active session
        db.prepare('DELETE FROM active_sessions WHERE project_hash = ?')
          .run(projectHash);
      }
      
      return;
    });
  } catch (error) {
    console.error("[DB] Error setting active session:", error);
    throw error;
  }
}

// Export the repositories for use in other modules
export { 
  sessionRepository,
  backgroundJobRepository
};

// Initialize database on server startup
if (isServer) {
  initializeDatabase().catch(err => {
    console.error("[DB] Failed to initialize database:", err);
  });
}

// Create a hash of a string (for project directory hashing)
export function hashString(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Export the necessary functions and objects
export {
  DB_FILE,
  APP_DATA_DIR,
  closeDatabase,
  connectionPool,
  getCachedState,
  saveCachedState,
  setupDatabase,
  ensureDbPermissions,
  runMigrations
};

// Export any other database utilities
export * from './repositories';
