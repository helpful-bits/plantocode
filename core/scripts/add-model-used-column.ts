// Add model_used column to sessions table if not exists
import connectionPool from "../lib/db/connection-pool";
import { GEMINI_FLASH_MODEL } from '../lib/constants';

async function addModelUsedColumn() {
  try {
    console.log('Adding model_used column to sessions table...');
    
    await connectionPool.withConnection(async (db) => {
      // Check if column exists
      const columnExists = db.prepare(`
        SELECT name FROM pragma_table_info('sessions') WHERE name='model_used'
      `).get();
      
      if (columnExists) {
        console.log('model_used column already exists in sessions table');
        return;
      }
      
      console.log('Adding model_used column to sessions table...');
      
      // Add the column
      db.prepare(`
        ALTER TABLE sessions ADD COLUMN model_used TEXT DEFAULT '${GEMINI_FLASH_MODEL}'
      `).run();
      
      // Create index
      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_sessions_model_used ON sessions(model_used)
      `).run();
      
      console.log('Successfully added model_used column to sessions table');
      
      // Add migration record
      const migrationExists = db.prepare(`
        SELECT name FROM migrations WHERE name='add_model_used_column'
      `).get();
      
      if (!migrationExists) {
        db.prepare(`
          INSERT INTO migrations (name, applied_at) 
          VALUES ('add_model_used_column', strftime('%s', 'now'))
        `).run();
        
        console.log('Added migration record');
      }
    }, false); // false for writable connection
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error adding model_used column:', error);
    throw error;
  } finally {
    await connectionPool.closeAll();
  }
}

// Run the migration
addModelUsedColumn()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });