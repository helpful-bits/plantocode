import path from 'path';
import fs from 'fs';
import { db } from './index';

/**
 * Function to run migrations
 */
export function runMigrations() {
  if (!db || typeof db.run !== 'function') {
    console.error("Database not initialized. Skipping migrations.");
    return;
  }
  // Path to the migrations folder
  const migrationsFolder = path.join(process.cwd(), 'migrations');

  // Create migrations folder if it doesn't exist
  fs.mkdirSync(migrationsFolder, { recursive: true });

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
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`, (createErr) => {
        if (createErr) {
          console.error("Error creating migrations table:", createErr);
          return;
        }
        console.log("Created migrations table.");
        // Now run all migrations since this is a fresh database
        applyMigrations(migrationsFolder);
      });
    } else {
      // If migrations table exists, get the list of applied migrations
      db.all("SELECT name FROM migrations", (fetchErr, rows: any[]) => {
        if (fetchErr) {
          console.error("Error fetching applied migrations:", fetchErr);
          return;
        }
        const appliedMigrations = new Set(rows?.map(r => r.name) || []);
        applyMigrations(migrationsFolder, appliedMigrations);
      });
    }
  });
}

/**
 * Helper function to actually apply the migrations
 */
function applyMigrations(migrationsFolder: string, appliedMigrations: Set<string> = new Set()) {
  const files = fs.readdirSync(migrationsFolder)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort to run migrations in order

  console.log(`Already applied: ${Array.from(appliedMigrations).join(', ')}`);

  files.forEach(file => {
    if (appliedMigrations.has(file)) {
      console.log(`Skipping already applied migration: ${file}`);
      return;
    }

    const filePath = path.join(migrationsFolder, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`Running migration: ${file}`);

    db.exec(sql, (execErr) => {
      if (execErr) {
        console.error(`Error running migration ${file}:`, execErr);
      } else {
        db.run('INSERT INTO migrations (name) VALUES (?)', [file], (recordErr) => {
          if (recordErr) console.error(`Error recording migration ${file}:`, recordErr);
          else console.log(`Successfully ran and recorded migration: ${file}`);
        });
      }
    });
  });
}
