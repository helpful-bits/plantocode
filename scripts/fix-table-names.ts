import { db } from '../lib/db';

async function fixTableNames() {
  console.log('Fixing table names...');
  
  try {
    // Begin transaction
    await executeSQL('BEGIN TRANSACTION');
    
    // First check if the tables exist
    const tables = await getTableNames();
    
    if (tables.includes('sessions_new') && !tables.includes('sessions')) {
      console.log('Renaming sessions_new to sessions...');
      await executeSQL('ALTER TABLE sessions_new RENAME TO sessions');
    } else {
      console.log('Sessions table is already correct or does not exist.');
    }
    
    if (tables.includes('project_settings_new') && !tables.includes('project_settings')) {
      console.log('Renaming project_settings_new to project_settings...');
      await executeSQL('ALTER TABLE project_settings_new RENAME TO project_settings');
    } else {
      console.log('Project_settings table is already correct or does not exist.');
    }
    
    // Commit transaction
    await executeSQL('COMMIT');
    console.log('Table names fixed successfully!');
  } catch (error) {
    console.error('Error fixing table names:', error);
    // Rollback on error
    try {
      await executeSQL('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back transaction:', rollbackError);
    }
    throw error;
  }
}

async function getTableNames(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, tables: any[]) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(tables.map(t => t.name));
    });
  });
}

async function executeSQL(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Run the function
fixTableNames()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  }); 