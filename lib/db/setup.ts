// Keep fs import
import fs from 'fs';
import path from 'path';
import { db, closeDatabase } from './index'; // Import db and closeDatabase from index

// Track if the database has been initialized
let isInitialized = false;

export async function setupDatabase(): Promise<void> {
  // Don't re-run if already initialized
  if (isInitialized) {
    return;
  }

    // Check if the database file exists before attempting migrations
    // const dbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.o1-pro-flow/o1-pro-flow.db'); // Example path, adjust as needed

  try {
    await runMigrations(); // Ensure migrations run on setup
    isInitialized = true;
    console.log('Database initialized and migrations checked.'); // Log success
  } catch (error) {
    console.error('Error setting up database:', error);
    throw error;
  }
}

/**
 * Run database migrations // Keep comment
 */
export async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');
  
  try {
    const migrationsTableExists = await new Promise<boolean>((resolve) => {
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'",
        (err, row) => {
          if (err) {
            console.error('Error checking for migrations table:', err);
            resolve(false);
          } else {
            resolve(!!row);
          }
        }
      );
    });
    
    // Create migrations table if it doesn't exist
    if (!migrationsTableExists) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          'CREATE TABLE migrations (id INTEGER PRIMARY KEY, name TEXT UNIQUE, applied_at INTEGER)',
          (err) => {
            if (err) {
              console.error('Error creating migrations table:', err);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    }
    
    // Get already applied migrations
    const appliedMigrations = await new Promise<string[]>((resolve, reject) => {
      db.all('SELECT name FROM migrations ORDER BY id', (err, rows: any[]) => {
        if (err) {
          console.error('Error fetching applied migrations:', err);
          reject(err);
        } else {
          resolve(rows.map(row => row.name));
        }
      });
    });
    
    // Migrations directory is at the project root
    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    
    // Skip if migrations directory doesn't exist
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found at:', migrationsDir);
      return;
    }
    
    // Get all migration files
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure proper order
    
    // Get pending migrations
    const pendingMigrations = migrationFiles.filter(file => !appliedMigrations.includes(file));
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations to apply');
      return;
    }
    
    console.log(`Found ${pendingMigrations.length} pending migrations to apply: ${pendingMigrations.join(', ')}`);
    
    // Apply each pending migration
    for (const migrationFile of pendingMigrations) {
      console.log(`Applying migration: ${migrationFile}`);
      
      // Read migration SQL
      const migrationPath = path.join(migrationsDir, migrationFile);
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      
      // Run migration within a transaction
      await new Promise<void>((resolve, reject) => {
        // Start a transaction for the migration
        db.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
            console.error(`Error starting transaction for migration ${migrationFile}:`, beginErr);
            return reject(beginErr);
          }
          
          // Execute the migration SQL
          db.exec(migrationSql, (execErr) => {
            if (execErr) {
              // Roll back on error
              console.error(`Error executing migration ${migrationFile}:`, execErr);
              db.run('ROLLBACK', () => reject(execErr));
            } else {
              // Record the migration in the migrations table
              db.run(
                'INSERT INTO migrations (name, applied_at) VALUES (?, ?)',
                [migrationFile, Date.now()],
                (insertErr) => {
                  if (insertErr) {
                    console.error(`Error recording migration ${migrationFile}:`, insertErr);
                    db.run('ROLLBACK', () => reject(insertErr));
                  } else {
                    // Commit the transaction
                    db.run('COMMIT', (commitErr) => {
                      if (commitErr) {
                        console.error(`Error committing migration ${migrationFile}:`, commitErr);
                        reject(commitErr);
                      } else {
                        console.log(`Successfully applied migration: ${migrationFile}`);
                        resolve();
                      }
                    });
                  }
                }
              );
            }
          });
        });
      });
    }
    
    console.log('All migrations successfully applied');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}

/** // Keep function comment
 * Reset the database by dropping all tables and rerunning migrations // Keep function comment
 */ // Keep function comment
export async function resetDatabase(): Promise<void> {
  console.log('Resetting database...');
    // Get all tables
    const tables = await new Promise<string[]>((resolve, reject) => {
      db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        (err, rows: any[]) => {
          if (err) {
            console.error('Error getting tables:', err);
            reject(err);
          } else {
            resolve(rows.map(row => row.name));
          }
        }
      );
    });
    
    // Drop all tables
    for (const table of tables) {
      await new Promise<void>((resolve, reject) => {
        db.run(`DROP TABLE IF EXISTS ${table}`, (err) => {
          if (err) {
            console.error(`Error dropping table ${table}:`, err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

      // Re-initialize migrations table after dropping everything
      await new Promise<void>((resolve, reject) => {
          db.run('CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, name TEXT UNIQUE, applied_at INTEGER)',
              (err) => err ? reject(err) : resolve());
      });

    // Run migrations to recreate the database
    await runMigrations();
    
    isInitialized = true; // Keep initialization flag update
    console.log('Database reset complete');
}


/**
 * Returns the status of the connection pool (placeholder, actual implementation in pool)
 */

/**
 * Get database info for diagnostics
 */
export async function getDatabaseInfo(): Promise<any> {
  if (!db) {
    return { location: 'Database not initialized', tables: [], tableCounts: [] };
  }

    // Get database file location
    const location = await new Promise<string>((resolve, reject) => {
      db.get("PRAGMA database_list", (err, result: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(result?.file || 'In-memory database');
        }
      });
    });
    
    // Get tables
    const tables = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
    
    // Get counts for each table
    const tableCounts = await Promise.all(
      tables.map(async (table) => {
        const count = await new Promise<number>((resolve, reject) => {
          db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(row.count);
            }
          });
        });
        
        return {
          name: table.name,
          count
        };
      })
    );
    
    return {
      location,
      tables: tables.map(t => t.name),
      tableCounts,
      // Connection pool status might be added here if needed
    };
}
