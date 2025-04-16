import { db } from '../lib/db';
import fs from 'fs';
import path from 'path';

async function runCachedStateMigration() {
  console.log('Running migration to remove output_format from cached_state table...');
  
  const migrationFile = path.join(process.cwd(), 'migrations', '0005_remove_output_format_from_cached_state.sql');
  
  if (!fs.existsSync(migrationFile)) {
    console.error('Migration file not found:', migrationFile);
    process.exit(1);
  }
  
  const sql = fs.readFileSync(migrationFile, 'utf8');
  
  return new Promise<void>((resolve, reject) => {
    // First check if the migration has already been applied
    db.get("SELECT name FROM migrations WHERE name = '0005_remove_output_format_from_cached_state.sql'", (err, row) => {
      if (err) {
        console.error('Error checking migration status:', err);
        return reject(err);
      }
      
      if (row) {
        console.log('Migration has already been applied. Skipping.');
        return resolve();
      }
      
      // Run the migration
      db.exec(sql, (execErr) => {
        if (execErr) {
          console.error('Error executing migration:', execErr);
          return reject(execErr);
        }
        
        // Record the migration
        db.run('INSERT INTO migrations (name) VALUES (?)', ['0005_remove_output_format_from_cached_state.sql'], (insertErr) => {
          if (insertErr) {
            console.error('Error recording migration:', insertErr);
            return reject(insertErr);
          }
          
          console.log('Migration completed successfully!');
          resolve();
        });
      });
    });
  });
}

// Run the migration
runCachedStateMigration()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  }); 