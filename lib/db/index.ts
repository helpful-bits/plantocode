// Server-side only database connection
import path from 'path';
import fs from 'fs';
import os from 'os';
import { setupDatabase, runMigrations } from './setup';
import { sessionRepository } from './repository-factory'; // Import sessionRepository
import { Session } from '@/types';
import { connectionPool, DB_FILE } from './connection-pool'; // Import DB_FILE and connectionPool

// Set up database file path
const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
// DB_FILE is now imported from connection-pool

// Create the app directory if it doesn't exist
if (!fs.existsSync(APP_DATA_DIR)) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

/**
 * Fix database file permissions to ensure it's writable
 */
async function fixDatabasePermissions(): Promise<void> {
  try {
    // Fix directory permissions first to prevent readonly database errors
    try {
      fs.chmodSync(APP_DATA_DIR, 0o775);
      console.log("App data directory permissions set to rwxrwxr-x");
    } catch (err) {
      console.warn("Failed to set app directory permissions:", err);
    }
    
    // Then fix database file permissions if it exists
    if (fs.existsSync(DB_FILE)) {
      // Set permissions to 0666 (rw-rw-rw-)
      fs.chmodSync(DB_FILE, 0o666);
      console.log("Database file permissions set to rw-rw-rw-");
    }
  } catch (err) {
    console.warn("Failed to set database file permissions:", err);
  }
}

/**
 * Ensures that a database connection is available
 * Used by integrity checks and other utilities
 */
async function ensureConnection() {
  try {
    return connectionPool.getConnection();
  } catch (error) {
    console.error("Error ensuring database connection:", error);
    throw error;
  }
}

/**
 * Close all open database connections
 */
function closeDatabase() {
  connectionPool.closeAll();
}

/**
 * Get a cached state entry by key
 */
async function getCachedState(key1: string, key2: string): Promise<string | null> {
  try {
    // Use connection pool to get a connection
    return await connectionPool.withConnection((db) => {
      // Generate hash of key1 and key2 for a consistent lookup
      const key1Hash = hashString(key1);
      const key2Hash = hashString(key2);
      
      // Try to get cached state value
      const row = db.prepare('SELECT value FROM cached_state WHERE key1_hash = ? AND key2_hash = ?')
                    .get(key1Hash, key2Hash);
      
      return row ? row.value : null;
    }, true); // Use readonly connection
  } catch (error) {
    console.error("Error getting cached state:", error);
    return null;
  }
}

/**
 * Save a value to the cached state
 */
async function saveCachedState(key1: string, key2: string, value: string): Promise<void> {
  try {
    // Use connection pool to get a connection
    await connectionPool.withConnection((db) => {
      // Generate hash of key1 and key2 for a consistent lookup
      const key1Hash = hashString(key1);
      const key2Hash = hashString(key2);
      
      // Check if the table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cached_state'")
                            .get();
      
      // Create table if it doesn't exist
      if (!tableExists) {
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
      }
      
      // Insert or replace value
      db.prepare(`
        INSERT OR REPLACE INTO cached_state (key1, key1_hash, key2, key2_hash, value, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        key1, 
        key1Hash,
        key2,
        key2Hash,
        value,
        Date.now()
      );
      
      return;
    });
  } catch (error) {
    console.error("Error saving cached state:", error);
    throw error;
  }
}

/**
 * Get a session with its background jobs
 */
async function getSessionWithRequests(sessionId: string): Promise<Session | null> {
  return sessionRepository.getSessionWithBackgroundJobs(sessionId);
}

/**
 * Get the active session ID for a project directory
 */
async function getActiveSessionId(projectDirectory: string): Promise<string | null> {
  try {
    // Convert project directory to consistent format
    projectDirectory = projectDirectory.trim();
    
    // hash the project directory for lookup
    const projectHash = hashString(projectDirectory);
    
    return await connectionPool.withConnection((db) => {
      // Check if table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='active_sessions'")
                            .get();
      
      if (!tableExists) {
        return null;
      }
      
      // Get active session ID
      const row = db.prepare('SELECT session_id FROM active_sessions WHERE project_hash = ?')
                    .get(projectHash);
      
      return row ? row.session_id : null;
    }, true); // Read-only operation
  } catch (error) {
    console.error("Error getting active session ID:", error);
    return null;
  }
}

/**
 * Set or clear the active session for a project directory
 */
async function setActiveSession(projectDirectory: string, sessionId: string | null): Promise<void> {
  try {
    // Convert project directory to consistent format
    projectDirectory = projectDirectory.trim();
    
    // hash the project directory for storage
    const projectHash = hashString(projectDirectory);
    
    await connectionPool.withConnection((db) => {
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
    console.error("Error setting active session:", error);
    throw error;
  }
}

/**
 * Hash a string using SHA-256 algorithm
 */
function hashString(str: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Export the necessary functions and objects
export {
  DB_FILE,
  closeDatabase,
  connectionPool,
  getCachedState,
  saveCachedState,
  getActiveSessionId,
  setActiveSession,
  getSessionWithRequests,
  sessionRepository,
  setupDatabase,
  runMigrations,
  ensureConnection
};
