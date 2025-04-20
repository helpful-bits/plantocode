// Script to reset the database by dropping all tables
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

// Same location as in the main app
const APP_DATA_DIR = path.join(os.homedir(), '.o1-pro-flow');
const DB_FILE = path.join(APP_DATA_DIR, 'o1-pro-flow.db');

console.log(`Attempting to reset database at: ${DB_FILE}`);

// Check if database file exists
if (!fs.existsSync(DB_FILE)) {
  console.log('Database file does not exist. Nothing to reset.');
  process.exit(0);
}

// Open database connection
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database.');
});

// Get all table names
db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, tables) => {
  if (err) {
    console.error('Error getting tables:', err.message);
    db.close();
    process.exit(1);
  }

  if (tables.length === 0) {
    console.log('No tables found in database.');
    db.close();
    process.exit(0);
  }

  console.log(`Found ${tables.length} tables to drop: ${tables.map(t => t.name).join(', ')}`);

  // Create a promise to track when all tables are dropped
  let dropped = 0;
  const totalTables = tables.length;

  // Drop each table
  tables.forEach(table => {
    console.log(`Dropping table: ${table.name}`);
    db.run(`DROP TABLE IF EXISTS ${table.name}`, (dropErr) => {
      if (dropErr) {
        console.error(`Error dropping table ${table.name}:`, dropErr.message);
      } else {
        console.log(`Successfully dropped table: ${table.name}`);
      }
      
      dropped++;
      if (dropped === totalTables) {
        console.log('All tables dropped successfully.');
        
        // Create empty migrations table to start fresh
        db.run('CREATE TABLE migrations (id INTEGER PRIMARY KEY, name TEXT UNIQUE, applied_at INTEGER)', (createErr) => {
          if (createErr) {
            console.error('Error creating migrations table:', createErr.message);
          } else {
            console.log('Created empty migrations table.');
          }
          
          // Close database connection
          db.close(() => {
            console.log('Database reset completed. Database connection closed.');
            console.log('You can now restart your application to run migrations on a clean database.');
          });
        });
      }
    });
  });
}); 