// Script to reset the database by dropping all tables
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

// Updated location with new names
const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db');
// Legacy location for migration
const OLD_APP_DATA_DIR = path.join(os.homedir(), '.o1-pro-flow');
const OLD_DB_FILE = path.join(OLD_APP_DATA_DIR, 'o1-pro-flow.db');

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
  } else {
    console.log('No database found. A new one will be created when the application starts.');
    process.exit(0);
  }
}

// Open the database
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  
  console.log('Connected to the database. Dropping all tables...');
  
  // Get a list of all tables
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, tables) => {
    if (err) {
      console.error('Error getting table list:', err.message);
      db.close();
      process.exit(1);
    }
    
    if (tables.length === 0) {
      console.log('No tables found in the database.');
      db.close();
      process.exit(0);
    }
    
    // Start a transaction
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('Error starting transaction:', err.message);
        db.close();
        process.exit(1);
      }
      
      // Function to recursively drop tables
      function dropTables(index) {
        if (index >= tables.length) {
          // All tables dropped, commit the transaction
          db.run('COMMIT', (err) => {
            if (err) {
              console.error('Error committing transaction:', err.message);
              db.run('ROLLBACK');
              db.close();
              process.exit(1);
            }
            
            console.log('All tables dropped successfully.');
            db.close();
            console.log('Database reset complete.');
            process.exit(0);
          });
          return;
        }
        
        const tableName = tables[index].name;
        console.log(`Dropping table: ${tableName}`);
        
        db.run(`DROP TABLE IF EXISTS ${tableName}`, (err) => {
          if (err) {
            console.error(`Error dropping table ${tableName}:`, err.message);
            db.run('ROLLBACK');
            db.close();
            process.exit(1);
          }
          
          // Drop the next table
          dropTables(index + 1);
        });
      }
      
      // Start dropping tables
      dropTables(0);
    });
  });
}); 