import * as sqlite3 from 'sqlite3'; // Keep sqlite3 import
import path from 'path';
import fs from 'fs';
import os from 'os';
import { runMigrations } from './migrations';
import connectionPool from './connection-pool';
import { sessionRepository, createSessionRepository } from './repository-factory';
import { setupDatabase, resetDatabase, getDatabaseInfo } from './setup';
const APP_DATA_DIR = path.join(os.homedir(), '.o1-pro-flow');
const DB_FILE = path.join(APP_DATA_DIR, 'o1-pro-flow.db'); // Keep database file path

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

export function initializeDatabase() {
  runMigrations(); // Run migrations on initialization
  return db;
}

export { db, closeDatabase };

function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error("Error closing database:", err.message);
      } else {
        console.log("Database connection closed");
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
  getDatabaseInfo
};
