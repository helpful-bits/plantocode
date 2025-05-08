// Run with: npx ts-node scripts/remove-diff-temperature.ts
/**
 * This script migrates the database to remove the diff_temperature column
 * from the sessions table.
 */

import path from 'path';
import os from 'os';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

// Set up database file paths directly
const APP_DATA_DIR = path.join(os.homedir(), '.o1-pro-flow');
const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db');

const exec = promisify(execCallback);

async function main() {
  console.log('Starting migration to remove diff_temperature column...');
  
  try {
    // First check if the database file exists
    try {
      await fs.access(DB_FILE);
      console.log(`Database file exists at: ${DB_FILE}`);
    } catch (err) {
      console.log(`Database file does not exist at ${DB_FILE}, nothing to migrate.`);
      return;
    }
    
    // SQL to create a new table without the diff_temperature column
    const migrationSql = `
      PRAGMA foreign_keys=off;
      
      BEGIN TRANSACTION;
      
      -- Create a new sessions table without the diff_temperature column
      CREATE TABLE sessions_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        project_directory TEXT,
        project_hash TEXT,
        task_description TEXT,
        search_term TEXT,
        _pasted_paths_deprecated TEXT,
        title_regex TEXT,
        content_regex TEXT,
        is_regex_active INTEGER DEFAULT 1 CHECK(is_regex_active IN (0, 1)),
        codebase_structure TEXT,
        updated_at INTEGER NOT NULL,
        negative_title_regex TEXT,
        negative_content_regex TEXT DEFAULT "",
        search_selected_files_only INTEGER DEFAULT 0 CHECK(search_selected_files_only IN (0, 1))
      );
      
      -- Copy data from the old table to the new table
      INSERT INTO sessions_new 
      SELECT 
        id, name, project_directory, project_hash,
        task_description, search_term, _pasted_paths_deprecated, 
        title_regex, content_regex, is_regex_active,
        codebase_structure, updated_at,
        negative_title_regex, negative_content_regex, search_selected_files_only
      FROM sessions;
      
      -- Drop the old table
      DROP TABLE sessions;
      
      -- Rename the new table to the original name
      ALTER TABLE sessions_new RENAME TO sessions;
      
      -- Recreate the indexes
      CREATE INDEX idx_sessions_project_hash ON sessions(project_hash);
      CREATE INDEX idx_sessions_project_directory ON sessions(project_directory);
      CREATE INDEX idx_sessions_updated_at ON sessions(updated_at);
      
      -- Check if migration already exists
      INSERT OR IGNORE INTO migrations (name, applied_at) 
      VALUES ('remove-diff-temperature-column', strftime('%s', 'now'));
      
      COMMIT;
      
      PRAGMA foreign_keys=on;
    `;
    
    // Save SQL to a temporary file
    const tempSqlFile = path.join(os.tmpdir(), 'remove-diff-temperature.sql');
    await fs.writeFile(tempSqlFile, migrationSql);
    console.log(`Migration SQL saved to ${tempSqlFile}`);
    
    // Execute the SQL script
    const { stdout, stderr } = await exec(`sqlite3 "${DB_FILE}" < "${tempSqlFile}"`);
    
    if (stderr) {
      console.error('Migration error:', stderr);
      throw new Error(stderr);
    }
    
    console.log('Migration completed successfully!');
    console.log('diff_temperature column has been removed from the sessions table.');
    
    // Clean up temp file
    await fs.unlink(tempSqlFile);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();