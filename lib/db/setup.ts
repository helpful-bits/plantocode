import { db } from './index'; // Keep db import
import { runMigrations } from './migrations'; // Keep runMigrations import

let isDbInitialized = false; // Flag to prevent multiple initializations
/**
 * Initialize the database and migrate data if necessary
 */
export async function setupDatabase() { // Keep function signature
  // Check if db is already initialized using the flag
  if (isDbInitialized) {
    // console.log("[Setup] Database already initialized."); // Reduce noise
    return;
  }

  if (!db) {
    console.error("Database object is not available in setup."); 
    return;
  }
  console.log("[Setup] Initializing database...");
  await runMigrations(); // Await migrations
  console.log("[Setup] Running migrations...");

  // Verify database structure after initialization
  isDbInitialized = true; // Mark as initialized
  verifyDatabaseStructure();
}

function verifyDatabaseStructure() {
  // Check if all expected tables exist
  const expectedTables = [
    'sessions',
    'included_files',
    'excluded_files',
    'project_settings',
    'cached_state',
    'migrations'
  ];

  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables: any[]) => {
    if (err) {
      console.error("Error verifying database structure:", err);
      return;
    }

    const existingTables = new Set(tables.map(t => t.name));
    const missingTables = expectedTables.filter(t => !existingTables.has(t));

    if (missingTables.length > 0) {
      console.warn(`Missing tables detected: ${missingTables.join(', ')}`);
      console.warn("Attempting to re-run migrations...");
      runMigrations(); // Attempt to run migrations again if tables are missing
    } else { // Only log success if no errors
      console.log("Database structure verification complete. All tables exist.");
    }
  });
}

/**
 * Cleanup function to be called on application shutdown
 */
export function cleanupDatabase() {
  // closeDatabase(); // Keep commented out
}

// Function to reset the database if needed
export function resetDatabase() {
  return new Promise<void>((resolve, reject) => {
    if (!db) {
      return reject(new Error("Database not initialized"));
    }
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables: any[]) => {
      if (err) {
        console.error("Error getting tables for reset:", err);
        reject(err);
        return;
      }

      const tableNames = tables
        .map(t => t.name)
        .filter(name => name !== 'sqlite_sequence' && name !== 'migrations');

      if (tableNames.length === 0) {
        console.log("No user tables to drop for reset");
        // Re-run migrations even if no tables were dropped to ensure schema is up-to-date
        console.log("Re-running migrations to ensure schema integrity...");
        runMigrations();
        resolve();
        return;
      }

      // Drop all tables
      db.serialize(() => {
        db.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
            console.error("Error beginning transaction for database reset:", beginErr);
            return reject(beginErr);
          }

          let dropError: Error | null = null;
          const dropPromises = tableNames.map(
            table => new Promise<void>((resolveTable, rejectTable) => {
              db.run(`DROP TABLE IF EXISTS ${table}`, (tableErr) => {
                if (tableErr) {
                  console.error(`Error dropping table ${table}:`, tableErr);
                  dropError = tableErr; // Store the first error encountered
                  rejectTable(tableErr);
                } else {
                  console.log(`Dropped table: ${table}`);
                  resolveTable();
                }
              });
            })
          );

          Promise.allSettled(dropPromises).then(() => {
            if (dropError) {
              db.run('ROLLBACK', () => reject(dropError));
            } else {
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  console.error("Error committing database reset:", commitErr);
                  db.run('ROLLBACK', () => reject(commitErr));
                } else {
                  console.log("Database reset complete. Re-initializing with migrations...");
                  runMigrations(); // Re-run migrations after dropping tables
                  resolve();
                }
              });
            }
          });
        });
      });
    });
  });
}
