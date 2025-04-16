import { db } from '../lib/db'; // Keep db import
import fs from 'fs'; // Keep fs import

import path from 'path'; // Keep path import
async function resetDatabase() { // Keep function signature
  console.log('Resetting database...');
  
  return new Promise<void>((resolve, reject) => {
    // First, drop all tables
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", async (err, tables: any[]) => {
      if (err) {
        console.error('Error getting tables:', err);
        return reject(err);
      }
      
      console.log(`Found ${tables.length} tables:`, tables.map(t => t.name).join(', '));
      
      // Drop the migrations table last
      const tablesToDrop = tables.filter(t => t.name !== 'migrations');
      const hasMigrationsTable = tables.some(t => t.name === 'migrations');
      
      if (tablesToDrop.length === 0 && !hasMigrationsTable) {
        console.log('No tables to drop.');
        return resolve();
      }
      
      // Begin transaction
      db.run('BEGIN TRANSACTION', async (beginErr) => {
        if (beginErr) {
          console.error('Error beginning transaction:', beginErr);
          return reject(beginErr);
        }
        
        try {
          // Drop all tables except migrations
          for (const table of tablesToDrop) {
            await new Promise<void>((resolveTable, rejectTable) => {
              db.run(`DROP TABLE IF EXISTS ${table.name}`, (dropErr) => {
                if (dropErr) {
                  console.error(`Error dropping table ${table.name}:`, dropErr);
                  return rejectTable(dropErr);
                }
                console.log(`Dropped table: ${table.name}`);
                resolveTable();
              });
            });
          }
          
          // Finally drop migrations table if it exists
          if (hasMigrationsTable) {
            await new Promise<void>((resolveTable, rejectTable) => {
              db.run('DROP TABLE IF EXISTS migrations', (dropErr) => {
                if (dropErr) {
                  console.error('Error dropping migrations table:', dropErr);
                  return rejectTable(dropErr);
                }
                console.log('Dropped migrations table');
                resolveTable();
              });
            });
          }
          
          // Commit transaction
          db.run('COMMIT', (commitErr) => {
            if (commitErr) {
              console.error('Error committing transaction:', commitErr);
              db.run('ROLLBACK', () => reject(commitErr));
            } else {
              console.log('All tables dropped successfully.');
              resolve();
            }
          });
        } catch (error) {
          console.error('Error during table drop:', error);
          db.run('ROLLBACK', () => reject(error));
        }
      });
    });
  });
}

async function applyMigrations() {
  console.log('Applying migrations...');
  
  // Create migrations table
  await new Promise<void>((resolve, reject) => {
    db.run(`CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )`, (err) => {
      if (err) {
        console.error('Error creating migrations table:', err);
        return reject(err);
      }
      resolve();
    });
  });
  
  // Get all SQL migration files
  const migrationsFolder = path.join(process.cwd(), 'migrations');
  const files = fs.readdirSync(migrationsFolder)
    .filter(file => file.endsWith('.sql'))
    .sort();
  
  console.log(`Found ${files.length} migration files.`);
  
  // Apply each migration
  for (const file of files) {
    console.log(`Applying migration: ${file}`);
    const filePath = path.join(migrationsFolder, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    await new Promise<void>((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) {
          console.error(`Error applying migration ${file}:`, err);
          return reject(err);
        }
        
        // Record the migration
        db.run('INSERT INTO migrations (name) VALUES (?)', [file], (insertErr) => {
          if (insertErr) {
            console.error(`Error recording migration ${file}:`, insertErr);
            return reject(insertErr);
          }
          console.log(`Migration ${file} applied and recorded.`);
          resolve();
        });
      });
    });
  }
}

async function run() { // Keep function signature
  try {
    await resetDatabase();
    await applyMigrations();
    console.log('Database reset and migrations applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to reset database:', error);
    process.exit(1);
  }
}

run(); 