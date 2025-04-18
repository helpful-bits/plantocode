import fs from 'fs';
import path from 'path';
import connectionPool from './connection-pool';

// Track if the database has been initialized
let isInitialized = false;

/**
 * Initialize the database by running migrations if needed
 */
export async function setupDatabase(): Promise<void> {
  // Don't re-run if already initialized
  if (isInitialized) {
    return;
  }
  
  try {
    await runMigrations();
    isInitialized = true;
  } catch (error) {
    console.error('Error setting up database:', error);
    throw error;
  }
}

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');
  
  return connectionPool.withConnection(async (db) => {
    // Check if migrations table exists
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
    
    console.log(`Found ${pendingMigrations.length} pending migrations to apply`);
    
    // Apply each pending migration
    for (const migrationFile of pendingMigrations) {
      console.log(`Applying migration: ${migrationFile}`);
      
      // Read migration SQL
      const migrationPath = path.join(migrationsDir, migrationFile);
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      
      // Run migration within a transaction
      await connectionPool.withTransaction(async (txDb) => {
        // Execute the migration SQL
        await new Promise<void>((resolve, reject) => {
          txDb.exec(migrationSql, (err) => {
            if (err) {
              console.error(`Error applying migration ${migrationFile}:`, err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
        
        // Record the migration in the migrations table
        await new Promise<void>((resolve, reject) => {
          txDb.run(
            'INSERT INTO migrations (name, applied_at) VALUES (?, ?)',
            [migrationFile, Date.now()],
            (err) => {
              if (err) {
                console.error(`Error recording migration ${migrationFile}:`, err);
                reject(err);
              } else {
                resolve();
              }
            }
          );
        });
      });
      
      console.log(`Successfully applied migration: ${migrationFile}`);
    }
    
    console.log('All migrations successfully applied');
  });
}

/**
 * Reset the database by dropping all tables and rerunning migrations
 */
export async function resetDatabase(): Promise<void> {
  console.log('Resetting database...');
  
  return connectionPool.withTransaction(async (db) => {
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
    
    // Run migrations to recreate the database
    await runMigrations();
    
    isInitialized = true;
    console.log('Database reset complete');
  });
}

/**
 * Get database info for diagnostics
 */
export async function getDatabaseInfo(): Promise<any> {
  return connectionPool.withConnection(async (db) => {
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
      connectionPoolStatus: connectionPool.getStatus ? connectionPool.getStatus() : 'Status not available'
    };
  }, true); // Read-only connection
}
