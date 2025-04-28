#!/usr/bin/env node

// Script to reset the database by dropping all tables
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');
const { promisify } = require('util');

// Define file paths
const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db');
const OLD_APP_DATA_DIR = path.join(os.homedir(), '.O1-studio');
const OLD_DB_FILE = path.join(OLD_APP_DATA_DIR, 'o1-studio.db');

/**
 * Fix database file permissions to ensure it's writable
 */
async function fixDatabasePermissions(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      // Set permissions to 0666 (rw-rw-rw-)
      fs.chmodSync(filePath, 0o666);
      console.log(`Database file permissions set to rw-rw-rw- for ${filePath}`);
    }
  } catch (err) {
    console.warn(`Failed to set database file permissions for ${filePath}:`, err);
  }
}

async function main() {
  console.log(`Attempting to reset database at: ${DB_FILE}`);

  // Check if the database exists
  if (!fs.existsSync(DB_FILE)) {
    // Check if old database exists for migration
    if (fs.existsSync(OLD_DB_FILE)) {
      console.log(`New database not found but old database exists at: ${OLD_DB_FILE}`);
      console.log('Migrating old database to new location before reset...');
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(APP_DATA_DIR)) {
        fs.mkdirSync(APP_DATA_DIR, { recursive: true });
      }
      
      // Copy old database to new location
      fs.copyFileSync(OLD_DB_FILE, DB_FILE);
      console.log('Database migrated successfully.');
      
      // Set proper permissions
      await fixDatabasePermissions(DB_FILE);
    } else {
      console.log('No database found. A new one will be created when the application starts.');
      process.exit(0);
    }
  }

  // Make sure directory has proper permissions
  if (fs.existsSync(APP_DATA_DIR)) {
    try {
      fs.chmodSync(APP_DATA_DIR, 0o755); // rwxr-xr-x
      console.log(`App data directory permissions set to rwxr-xr-x for ${APP_DATA_DIR}`);
    } catch (dirPermErr) {
      console.warn(`Failed to set app data directory permissions: ${dirPermErr}`);
    }
  }

  // Fix permissions on existing database file
  await fixDatabasePermissions(DB_FILE);

  // Create backup of the current database
  const BACKUP_FILE = `${DB_FILE}.backup-${Date.now()}`;
  try {
    fs.copyFileSync(DB_FILE, BACKUP_FILE);
    console.log(`Backup created at: ${BACKUP_FILE}`);
    await fixDatabasePermissions(BACKUP_FILE);
  } catch (backupErr) {
    console.warn(`Warning: Failed to create backup: ${backupErr.message}`);
  }

  // Promisify database operations
  const dbOpen = promisify((cb) => {
    const db = new sqlite3.Database(DB_FILE, cb);
    return db;
  });
  
  let db;
  try {
    db = await dbOpen();
    console.log('Connected to the database. Dropping all tables...');
    
    // Get all tables
    const getTables = promisify(db.all.bind(db));
    const tables = await getTables("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", []);
    
    if (tables.length === 0) {
      console.log('No tables found in the database.');
      db.close();
      process.exit(0);
    }
    
    // Start a transaction
    const run = promisify(db.run.bind(db));
    await run('BEGIN TRANSACTION');
    
    // Drop each table
    const errors = [];
    for (const table of tables) {
      console.log(`Dropping table: ${table.name}`);
      try {
        await run(`DROP TABLE IF EXISTS "${table.name}"`);
      } catch (err) {
        console.error(`Error dropping table ${table.name}:`, err.message);
        errors.push({ table: table.name, error: err.message });
      }
    }
    
    if (errors.length > 0) {
      // Roll back if there were errors
      await run('ROLLBACK');
      console.error('Transaction rolled back due to errors:');
      errors.forEach(e => console.error(`- Table ${e.table}: ${e.error}`));
      db.close();
      process.exit(1);
    } else {
      // Commit if all tables were dropped successfully
      await run('COMMIT');
      console.log('All tables dropped successfully.');
      
      // Verify and fix permissions again after changes
      const dbClose = promisify(db.close.bind(db));
      await dbClose();
      await fixDatabasePermissions(DB_FILE);
      console.log('Done. The database has been reset and is ready for use.');
      process.exit(0);
    }
  } catch (err) {
    console.error('Error during database operation:', err.message);
    if (db) db.close();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled error in main process:', err);
  process.exit(1);
}); 