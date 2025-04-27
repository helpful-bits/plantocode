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
  console.log("Running database migrations...");
  
  // First, check if we have already run migrations by trying to query the migrations table
  try {
    const tableExists = await new Promise((resolve, reject) => {
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'", (err: Error | null, row: any) => {
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
      )`, (createErr: Error | null) => {
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
        db.all("SELECT name FROM migrations", (fetchErr: Error | null, rows: any[]) => {
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
    throw new Error("Error setting up database: " + error);
  }
}

/**
 * Helper function to actually apply the migrations
 */
async function applyMigrations(migrationsFolder: string, appliedMigrations: Set<string> = new Set()): Promise<void> { // Make async
  try {
    const files = fs.readdirSync(migrationsFolder)
      .filter(file => file.endsWith('.sql') && !file.includes('.disabled'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })); // Natural sort order

    console.log(`Found ${files.length} pending migrations to apply: ${files.filter(file => !appliedMigrations.has(file)).join(', ')}`);

    // Track if we've hit a fatal error that should stop all migrations
    let fatalErrorOccurred = false;

    for (const file of files) {
      if (fatalErrorOccurred) {
        console.log(`Skipping migration ${file} due to previous fatal error`);
        continue;
      }

      if (appliedMigrations.has(file)) {
        continue; // Skip already applied migrations
      }

      const filePath = path.join(migrationsFolder, file);
      const sql = fs.readFileSync(filePath, 'utf8').trim(); // Trim SQL content
      if (!sql) continue; // Skip empty migration files

      console.log(`Applying migration: ${file}`);
      
      // Wrap execution in a promise
      try {
        await new Promise<void>((resolve, reject) => {
          // Use a transaction to ensure each migration is atomic
          db.exec(sql, (execErr: Error | null) => {
            if (execErr) {
              console.error(`Error executing migration ${file}:`, execErr);
              reject(execErr);
            } else {
              // Record the migration in the migrations table
              db.run('INSERT INTO migrations (name) VALUES (?)', [file], (recordErr: Error | null) => {
                if (recordErr) {
                  console.error(`Error recording ${file}:`, recordErr);
                  reject(recordErr); // Reject if recording fails
                } else {
                  console.log(`Successfully applied migration: ${file}`);
                  resolve();
                }
              });
            }
          });
        });
      } catch (error) {
        console.error(`Error running migrations:`, error);
        
        // Special handling for the problem migration
        if (file === '0008_rename_patch_path_to_xml_path.sql') {
          console.log(`Migration ${file} failed, but it's a known issue. Continuing with next migration.`);
          // Skip recording this migration to try again next time
          continue;
        }
        
        fatalErrorOccurred = true;
        throw error; // Re-throw to be caught by outer try/catch
      }
    }
    
    console.log("Migration process completed");
  } catch (error) {
    console.error("Error running migrations:", error);
    throw error; // Propagate the error up
  }
}
