import path from 'path';
import fs from 'fs';
import { db } from './index'; // Keep db import

/**
 * Function to run migrations
 */
export async function runMigrations(): Promise<void> { // Make function async
  if (!db || typeof db.run !== 'function') {
    // console.error("Database not initialized. Skipping migrations."); // Reduce noise
    return;
  }
  // Path to the migrations folder
  const migrationsFolder = path.join(process.cwd(), 'migrations');

  // Create migrations folder if it doesn't exist
  fs.mkdirSync(migrationsFolder, { recursive: true });
  console.log("Migrations folder:", migrationsFolder);
  // First, check if we have already run migrations by trying to query the migrations table
  try {
    const tableExists = await new Promise((resolve, reject) => {
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'", (err, row) => {
        if (err) {
          console.error("Error checking migrations table:", err);
          reject(err);
        } else {
          resolve(!!row);
        }
      });
    });

    // If migrations table doesn't exist, create it
    if (!tableExists) {
      console.log("Migrations table not found, creating...");
      await new Promise<void>((resolve, reject) => {
        db.run(`CREATE TABLE migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`, (createErr) => {
          if (createErr) {
            console.error("Error creating migrations table:", createErr);
            reject(createErr);
          } else {
            console.log("Created migrations table.");
            resolve();
          }
        });
      });
      // Now run all migrations since this is a fresh database
      await applyMigrations(migrationsFolder);
    } else {
      // If migrations table exists, get the list of applied migrations
      const appliedMigrations = await new Promise<Set<string>>((resolve, reject) => {
        db.all("SELECT name FROM migrations", (fetchErr, rows: any[]) => {
        if (fetchErr) {
          console.error("Error fetching applied migrations:", fetchErr);
          reject(fetchErr);
        } else {
          resolve(new Set(rows?.map(r => r.name) || []));
        }
      });
      });
      // Apply migrations after resolving the Promise, not inside it
      await applyMigrations(migrationsFolder, appliedMigrations);
    }
  } catch (error) {
    console.error("Error during migration setup:", error);
  }
}

/**
 * Helper function to actually apply the migrations
 */
async function applyMigrations(migrationsFolder: string, appliedMigrations: Set<string> = new Set()): Promise<void> { // Make async
  const files = fs.readdirSync(migrationsFolder)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort to run migrations in order

  console.log(`[Migration] Found ${files.length} SQL files. Already applied: ${appliedMigrations.size}`);

  for (const file of files) {
    if (appliedMigrations.has(file)) {
      // console.log(`[Migration] Skipping already applied: ${file}`); // Reduce noise
      continue; // Changed from 'return' to 'continue' to process all migration files
    }

    const filePath = path.join(migrationsFolder, file);
    const sql = fs.readFileSync(filePath, 'utf8').trim(); // Trim SQL content
    if (!sql) continue; // Skip empty migration files

    // Wrap execution in a promise
    try {
      await new Promise<void>((resolve, reject) => {
        db.exec(sql, (execErr) => {
          if (execErr) {
            console.error(`[Migration] Error running ${file}:`, execErr);
            reject(execErr);
          } else {
            // Record the migration in the migrations table
            db.run('INSERT INTO migrations (name) VALUES (?)', [file], (recordErr) => {
              if (recordErr) {
                console.error(`[Migration] Error recording ${file}:`, recordErr);
                reject(recordErr); // Reject if recording fails
              } else {
                console.log(`[Migration] Successfully ran and recorded: ${file}`);
                resolve();
              }
            });
          }
        });
      });
    } catch (error) {
      console.error(`[Migration] Failed to apply migration ${file}. Stopping further migrations.`);
      break; // Stop applying migrations if one fails
    }
  }
  console.log("[Migration] Finished applying migrations.");
}
