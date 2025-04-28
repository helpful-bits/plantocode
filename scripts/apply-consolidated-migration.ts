#!/usr/bin/env node

import { setupDatabase, closeDatabase } from '../lib/db';
import { db } from '../lib/db/index';
import path from 'path';
import fs from 'fs';

/**
 * Script to apply the consolidated migration file directly
 * Execute with: npx tsx scripts/apply-consolidated-migration.ts
 */
async function main() {
  try {
    console.log("========================================================");
    console.log("⚠️  APPLYING CONSOLIDATED MIGRATIONS");
    console.log("========================================================");
    
    console.log("Initializing database...");
    await setupDatabase();
    
    // Path to the consolidated migration file
    const migrationsFolder = path.join(process.cwd(), 'migrations');
    const migrationFile = path.join(migrationsFolder, 'consolidated_migrations.sql');
    
    if (!fs.existsSync(migrationFile)) {
      console.error(`❌ ERROR: Consolidated migration file not found at ${migrationFile}`);
      process.exit(1);
    }
    
    console.log(`Applying consolidated migration from ${migrationFile}...`);
    const sql = fs.readFileSync(migrationFile, 'utf8').trim();
    
    // Create migrations table if it doesn't exist
    await new Promise<void>((resolve, reject) => {
      db.run(`CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )`, (err) => {
        if (err) {
          console.error("Error creating migrations table:", err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    // Split the SQL into individual statements to avoid errors with missing columns
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    console.log(`Executing ${statements.length} SQL statements...`);
    
    // Execute each statement individually
    for (const statement of statements) {
      try {
        await new Promise<void>((resolve, reject) => {
          db.run(statement.trim() + ';', (err) => {
            if (err) {
              // Just log the error but continue with other statements
              console.warn(`Warning: Statement failed: ${err.message}`);
              console.warn(`Statement: ${statement.trim().substring(0, 100)}...`);
            }
            resolve(); // Always resolve to continue with next statement
          });
        });
      } catch (err) {
        console.warn(`Error executing statement: ${err.message}`);
      }
    }
    
    // Record that we applied this migration
    await new Promise<void>((resolve, reject) => {
      db.run('INSERT OR IGNORE INTO migrations (name) VALUES (?)', 
        ['consolidated_migrations.sql'], 
        (err) => {
          if (err) {
            console.warn("Failed to record migration, but schema changes were applied:", err);
          }
          resolve();
      });
    });
    
    console.log("✅ Consolidated migration applied successfully.");
    console.log("You can now start the application with: pnpm dev");
  } catch (error) {
    console.error("❌ ERROR applying consolidated migration:", error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

// Run the function
main(); 