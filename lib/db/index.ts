// Server-side only database connection
import path from 'path';
import fs from 'fs';
import os from 'os';
import sqlite3 from 'sqlite3';
import { setupDatabase, runMigrations } from './setup';
import { sessionRepository } from './repository-factory'; // Import sessionRepository
import { Session } from '@/types';
import { DB_FILE } from './connection-pool'; // Import DB_FILE from connection-pool

// Set up database file path
const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
// DB_FILE is now imported from connection-pool
let isReadOnly = false;
let dbIsOpen = false;
let connectionInProgress = false;
let connectionPromise: Promise<sqlite3.Database> | null = null;

// Create the app directory if it doesn't exist
if (!fs.existsSync(APP_DATA_DIR)) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

// Singleton database instance
let db: sqlite3.Database;

// Function to open database connection
function openDatabase(): Promise<sqlite3.Database> {
  // If we already have an open connection, return it
  if (db && dbIsOpen) return Promise.resolve(db);
  
  // If a connection attempt is already in progress, return that promise
  if (connectionPromise) return connectionPromise;
  
  console.log("Opening database connection to:", DB_FILE);
  
  // Set flag to indicate connection is in progress
  connectionInProgress = true;
  
  // Create and store the connection promise
  connectionPromise = new Promise<sqlite3.Database>((resolve, reject) => {
    try {
      // First check for directory existence and permissions
      const dbDir = path.dirname(DB_FILE);
      if (!fs.existsSync(dbDir)) {
        try {
          fs.mkdirSync(dbDir, { recursive: true });
        } catch (err) {
          console.error("Failed to create database directory:", err);
          connectionInProgress = false;
          connectionPromise = null;
          reject(new Error(`Failed to create database directory: ${err.message}`));
          return;
        }
      }
      
      // First try to open with read-write access
      db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          console.error("Failed to open database with read-write access:", err.message);
          
          // Check if it's a readonly error
          if (err.code === 'SQLITE_READONLY' || err.message.includes('readonly')) {
            console.warn("Database is readonly, falling back to readonly mode");
            isReadOnly = true;
            
            // Try to open as readonly
            db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READONLY, (roErr) => {
              if (roErr) {
                console.error("Failed to open database even in readonly mode:", roErr.message);
                dbIsOpen = false;
                connectionInProgress = false;
                connectionPromise = null;
                reject(new Error(`Failed to open database: ${roErr.message}`));
              } else {
                console.log(`Connected to SQLite database (readonly): ${DB_FILE}`);
                dbIsOpen = true;
                setupDatabasePragmas();
                connectionInProgress = false;
                resolve(db);
              }
            });
          } else {
            console.error("Failed to open database:", err);
            dbIsOpen = false;
            connectionInProgress = false;
            connectionPromise = null;
            reject(new Error(`Failed to open database: ${err.message}`));
          }
        } else {
          console.log(`Connected to SQLite database: ${DB_FILE}`);
          dbIsOpen = true;
          setupDatabasePragmas();
          connectionInProgress = false;
          resolve(db);
        }
      });
    } catch (error) {
      console.error("Error opening database:", error);
      dbIsOpen = false;
      connectionInProgress = false;
      connectionPromise = null;
      reject(new Error(`Error during database connection: ${error.message}`));
    }
  });
  
  // Reset connectionPromise when it completes (whether success or failure)
  connectionPromise.catch(() => {
    connectionPromise = null;
  });
  
  return connectionPromise;
}

// Set database pragmas
function setupDatabasePragmas() {
  if (!db || !dbIsOpen) return;
  
  // Enable foreign key support
  db.run('PRAGMA foreign_keys = ON;');
  
  // Set journal mode to DELETE for better compatibility
  db.run('PRAGMA journal_mode = DELETE;');
  
  // Set busy timeout
  db.run('PRAGMA busy_timeout = 5000;');
}

// Function to ensure database is open before any operation
async function ensureConnection(): Promise<sqlite3.Database> {
  if (!db || !dbIsOpen) {
    try {
      return await openDatabase();
    } catch (error) {
      console.error("Database connection failed:", error);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }
  
  // Check if database is in readonly mode
  if (isReadOnly) {
    console.warn("Database is in readonly mode, operations may be limited");
  }
  
  return db;
}

function closeDatabase() {
  if (db && dbIsOpen) {
    db.close((err) => {
      if (err) {
        console.error("Error closing database:", err.message);
      } else {
        console.log("Database connection closed");
        dbIsOpen = false;
        connectionPromise = null;
      }
    });
  }
}

// Get a cached state value from the database
async function getCachedState(key1: string, key2: string): Promise<string | null> {
  try {
    const database = await ensureConnection();
    
    return new Promise((resolve, reject) => {
      database.get(
        'SELECT value FROM cached_state WHERE key1 = ? AND key2 = ?',
        [key1, key2],
        (err, row) => {
          if (err) {
            console.error(`Error getting cached state for ${key1}/${key2}:`, err);
            reject(err);
            return;
          }
          
          if (row) {
            resolve(row.value);
          } else {
            resolve(null);
          }
        }
      );
    });
  } catch (error) {
    console.error(`Error in getCachedState for ${key1}/${key2}:`, error);
    return null;
  }
}

// Save a cached state value to the database
async function saveCachedState(key1: string, key2: string, value: string): Promise<void> {
  try {
    const database = await ensureConnection();
    
    return new Promise((resolve, reject) => {
      database.run(
        `INSERT INTO cached_state (key1, key2, value, updated_at) 
         VALUES (?, ?, ?, datetime('now')) 
         ON CONFLICT (key1, key2) 
         DO UPDATE SET value = ?, updated_at = datetime('now')`,
        [key1, key2, value, value],
        (err) => {
          if (err) {
            console.error(`Error saving cached state for ${key1}/${key2}:`, err);
            reject(err);
            return;
          }
          
          resolve();
        }
      );
    });
  } catch (error) {
    console.error(`Error in saveCachedState for ${key1}/${key2}:`, error);
    throw error;
  }
}

/**
 * Get a session with all its background job requests
 * This is a convenience wrapper around sessionRepository.getSessionWithBackgroundJobs
 */
async function getSessionWithRequests(sessionId: string): Promise<Session | null> {
  // Ensure database is initialized
  await ensureConnection();
  
  // Use the repository's getSessionWithBackgroundJobs method
  return sessionRepository.getSessionWithBackgroundJobs(sessionId);
}

/**
 * Get the active session ID for a project directory
 * @param projectDirectory The project directory
 * @returns The active session ID, or null if none is set
 */
async function getActiveSessionId(projectDirectory: string): Promise<string | null> {
  try {
    console.log(`[DB] Getting active session ID for project: ${projectDirectory}`);
    const database = await ensureConnection();
    
    // Calculate hash for the project directory
    const projectHash = hashString(projectDirectory);
    
    return new Promise((resolve, reject) => {
      database.get(
        'SELECT session_id FROM active_sessions WHERE project_hash = ?',
        [projectHash],
        (err, row) => {
          if (err) {
            console.error(`Error getting active session for ${projectDirectory}:`, err);
            reject(err);
            return;
          }
          
          if (row) {
            console.log(`[DB] Found active session ${row.session_id || 'null'} for project ${projectDirectory}`);
            resolve(row.session_id);
          } else {
            console.log(`[DB] No active session found for project ${projectDirectory}`);
            resolve(null);
          }
        }
      );
    });
  } catch (error) {
    console.error(`Error in getActiveSessionId for ${projectDirectory}:`, error);
    return null;
  }
}

/**
 * Set the active session ID for a project directory
 * @param projectDirectory The project directory
 * @param sessionId The active session ID, or null to clear
 */
async function setActiveSession(projectDirectory: string, sessionId: string | null): Promise<void> {
  try {
    console.log(`[DB] Setting active session for project ${projectDirectory} to: ${sessionId || 'null'}`);
    const database = await ensureConnection();
    
    // Calculate hash for the project directory
    const projectHash = hashString(projectDirectory);
    const now = Math.floor(Date.now() / 1000);
    
    return new Promise((resolve, reject) => {
      database.run(
        `INSERT INTO active_sessions (project_directory, project_hash, session_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (project_hash)
         DO UPDATE SET session_id = ?, updated_at = ?`,
        [projectDirectory, projectHash, sessionId, now, sessionId, now],
        (err) => {
          if (err) {
            console.error(`Error setting active session for ${projectDirectory}:`, err);
            reject(err);
            return;
          }
          
          console.log(`[DB] Successfully set active session for project ${projectDirectory}`);
          resolve();
        }
      );
    });
  } catch (error) {
    console.error(`Error in setActiveSession for ${projectDirectory}:`, error);
    throw error;
  }
}

/**
 * Helper function to hash a string
 * This matches the hash function used elsewhere in the app
 */
function hashString(str: string): string {
  // Treat null, undefined, empty string, or 'global' as 'global' consistently
  if (str === 'global' || !str) return 'global';
  
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex string and pad to ensure consistent length
  return (hash >>> 0).toString(16).padStart(8, '0'); // Pad to ensure consistent length
}

// Export only what's needed
export {
  db,
  ensureConnection,
  closeDatabase,
  setupDatabase,
  runMigrations,
  DB_FILE,
  isReadOnly,
  getCachedState,
  saveCachedState,
  sessionRepository,
  getSessionWithRequests,
  getActiveSessionId,
  setActiveSession
};
