import connectionPool from '../lib/db/connection-pool';
import Database from 'better-sqlite3';

async function fixTableNames() { // Keep function signature
  console.log('Fixing table names...');
  
  try {
    // Execute all operations in a transaction
    await connectionPool.withTransaction(async (db) => {
      // First check if the tables exist
      const tables = await getTables();
      
      if (tables.includes('sessions_new') && !tables.includes('sessions')) {
        console.log('Renaming sessions_new to sessions...');
        db.prepare('ALTER TABLE sessions_new RENAME TO sessions').run();
      } else {
        console.log('Sessions table is already correct or does not exist.');
      }
      
      if (tables.includes('project_settings_new') && !tables.includes('project_settings')) {
        console.log('Renaming project_settings_new to project_settings...');
        db.prepare('ALTER TABLE project_settings_new RENAME TO project_settings').run();
      } else {
        console.log('Project_settings table is already correct or does not exist.');
      }
    });
    
    console.log('Table names fixed successfully!');
  } catch (error) {
    console.error('Error fixing table names:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function getTables(): Promise<string[]> {
  return connectionPool.withConnection((db: Database.Database) => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{name: string}>;
    return tables.map(t => t.name);
  });
}

// Run the function
fixTableNames()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }); 