import * as sqlite3 from 'sqlite3'; // Keep sqlite3 import
import path from 'path';
import fs from 'fs';
import os from 'os';
import { setupDatabase, resetDatabase, getDatabaseInfo, runMigrations } from './setup'; // Import from setup
import connectionPool from './connection-pool';
import { sessionRepository, createSessionRepository } from './repository-factory';
import { 
  getActiveSessionId, 
  setActiveSession, 
  getCachedState, 
  saveCachedState,
  getSessions,
  deleteSession,
  getSessionWithRequests
} from './database-client';

const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db');

// Create the new app directory if it doesn't exist
if (!fs.existsSync(APP_DATA_DIR)) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

// sqlite3.verbose(); // Keep verbose mode commented out unless debugging SQL
let db: sqlite3.Database;

try {
  db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
      console.error("Failed to open database:", err.message);
      // Fallback or error handling strategy could be implemented here
    } else {
      console.log(`Connected to SQLite database: ${DB_FILE}`);
      // Enable foreign key support
      db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
        if (pragmaErr) {
          console.error("Failed to enable foreign key support:", pragmaErr.message);
        }
      });
    }
  });
} catch (error) {
  console.error("Error initializing database instance:", error);
  // @ts-expect-error - Assign a dummy object to avoid undefined errors later, though operations will fail
  db = { close: () => {}, run: () => {}, get: () => {}, all: () => {}, exec: () => {} };
}

export { db, closeDatabase };

function closeDatabase() {
  if (db) {
    db.close((err) => { // Ensure db is not undefined before closing
      if (db) {
        if (err) {
          console.error("Error closing database:", err.message);
        } else {
          console.log("Database connection closed");
        }
      }
    });
  }
}

// Export all database-related functionality
export {
  connectionPool,
  sessionRepository,
  createSessionRepository,
  setupDatabase,
  runMigrations,
  resetDatabase,
  getDatabaseInfo,
  // Export the additional database client methods
  getActiveSessionId,
  setActiveSession, 
  getCachedState,
  saveCachedState,
  getSessions,
  deleteSession,
  getSessionWithRequests
};
