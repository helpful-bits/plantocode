import * as sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Define the app data directory path
const APP_DATA_DIR = path.join(os.homedir(), '.o1-pro-flow');
const DB_FILE = path.join(APP_DATA_DIR, 'o1-pro-flow.db');

// Ensure the app data directory exists
if (!fs.existsSync(APP_DATA_DIR)) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

// Create a database instance with verbose mode for better error messages
sqlite3.verbose();
const db = new sqlite3.Database(DB_FILE);

// Function to run migrations
export function runMigrations() {
  // Path to the migrations folder
  const migrationsFolder = path.join(process.cwd(), 'migrations');
  
  // Create migrations folder if it doesn't exist
  if (!fs.existsSync(migrationsFolder)) {
    fs.mkdirSync(migrationsFolder, { recursive: true });
  }
  
  // First, check if we have already run migrations by trying to query the migrations table
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'", (err, row) => {
    if (err) {
      console.error("Error checking migrations table:", err);
      return;
    }
    
    // If migrations table doesn't exist, create it
    if (!row) {
      db.run(`CREATE TABLE migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`, (err) => {
        if (err) {
          console.error("Error creating migrations table:", err);
          return;
        }
        
        // Now run all migrations since this is a fresh database
        applyMigrations(migrationsFolder);
      });
    } else {
      // If migrations table exists, get the list of applied migrations
      db.all("SELECT name FROM migrations", (err, rows) => {
        if (err) {
          console.error("Error fetching applied migrations:", err);
          return;
        }
        
        // Create a set of already applied migrations
        const appliedMigrations = new Set(rows?.map(row => row.name) || []);
        
        // Run only migrations that haven't been applied yet
        applyMigrations(migrationsFolder, appliedMigrations);
      });
    }
  });
}

// Helper function to actually apply the migrations
function applyMigrations(migrationsFolder: string, appliedMigrations: Set<string> = new Set()) {
  // Run migrations by executing the SQL files
  const files = fs.readdirSync(migrationsFolder)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort to run migrations in order

  files.forEach(file => {
    // Skip if this migration has already been applied
    if (appliedMigrations.has(file)) {
      console.log(`Skipping already applied migration: ${file}`);
      return;
    }
    
    const filePath = path.join(migrationsFolder, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Execute each SQL statement in the migration file
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error(`Error beginning transaction for migration ${file}:`, err);
        return;
      }
      
      db.exec(sql, (err) => {
        if (err) {
          console.error(`Error running migration ${file}:`, err);
          db.run('ROLLBACK', () => {
            console.log(`Rolled back changes for migration ${file}`);
          });
          return;
        }
        
        // Record that this migration has been applied
        db.run('INSERT INTO migrations (name) VALUES (?)', [file], (err) => {
          if (err) {
            console.error(`Error recording migration ${file}:`, err);
            db.run('ROLLBACK', () => {
              console.log(`Rolled back changes for migration ${file}`);
            });
            return;
          }
          
          // Commit the transaction
          db.run('COMMIT', (err) => {
            if (err) {
              console.error(`Error committing migration ${file}:`, err);
              db.run('ROLLBACK', () => {
                console.log(`Rolled back changes for migration ${file}`);
              });
              return;
            }
            
            console.log(`Successfully ran migration: ${file}`);
          });
        });
      });
    });
  });
}

// Initialize database
export function initializeDatabase() {
  // Run all migrations
  runMigrations();
  
  // Return the database connection
  return db;
}

// Close database connection when the app is shutting down
export function closeDatabase() {
  db.close();
}

// Export the database connection
export { db }; 