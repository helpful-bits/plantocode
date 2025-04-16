import { db } from '../lib/db'; // Keep db import

async function getDBInfo() { // Keep function signature
  console.log('Checking SQLite database...');
  
  // First, get database file location
  db.get("PRAGMA database_list", (err, result) => {
    if (err) {
      console.error('Error getting database location:', err);
      process.exit(1);
    }
    
    console.log('Database location:', result?.file || 'In-memory database');
  });

  // List all tables
  await listTables();
  
  // Check migrations
  await checkMigrations();
  
  // Check schema for specific tables
  await checkTableSchema('sessions');
  await checkTableSchema('project_settings');
  await checkTableSchema('cached_state');
}

async function listTables() {
  return new Promise<void>((resolve, reject) => {
    db.all("SELECT name, type FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
      if (err) {
        console.error('Error listing tables:', err);
        return reject(err);
      }
      
      console.log('\n=== Tables ===');
      if (tables.length === 0) {
        console.log('No tables found in database.');
      } else {
        tables.forEach(table => {
          console.log(`- ${table.name}`);
        });
      }
      
      resolve();
    });
  });
}

async function checkMigrations() {
  return new Promise<void>((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'", (err, result) => {
      if (err) {
        console.error('Error checking migrations table:', err);
        return reject(err);
      }
      
      if (!result || result.length === 0) {
        console.log('\n=== Migrations ===');
        console.log('Migrations table does not exist.');
        return resolve();
      }
      
      db.all("SELECT id, name, applied_at FROM migrations ORDER BY id", (migrErr, migrations) => {
        if (migrErr) {
          console.error('Error fetching migrations:', migrErr);
          return reject(migrErr);
        }
        
        console.log('\n=== Migrations ===');
        if (migrations.length === 0) {
          console.log('No migrations have been applied.');
        } else {
          migrations.forEach(migration => {
            const date = new Date(migration.applied_at * 1000).toISOString();
            console.log(`- [${migration.id}] ${migration.name} (${date})`);
          });
        }
        
        resolve();
      });
    });
  });
}

async function checkTableSchema(tableName: string) {
  return new Promise<void>((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      if (err) {
        console.error(`Error getting schema for table ${tableName}:`, err);
        return reject(err);
      }
      
      console.log(`\n=== Schema for '${tableName}' ===`);
      if (!columns || columns.length === 0) {
        console.log(`Table '${tableName}' does not exist or has no columns.`);
      } else {
        columns.forEach(col => {
          const notNull = col.notnull ? 'NOT NULL' : 'NULL';
          const pk = col.pk ? 'PRIMARY KEY' : '';
          console.log(`- ${col.name} (${col.type}) ${notNull} ${pk} Default: ${col.dflt_value || 'NULL'}`);
        });
      }
      
      resolve();
    });
  });
}

// Run the function
getDBInfo()
  .then(() => {
    console.log('\nDatabase inspection complete.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error inspecting database:', error);
    process.exit(1);
  }); 