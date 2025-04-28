#!/usr/bin/env node

import { setupDatabase, closeDatabase } from '../lib/db';
import { db } from '../lib/db/index';

/**
 * Script to fix the path/file_path column inconsistency in included_files and excluded_files tables
 * Execute with: npx tsx scripts/fix-file-path-columns.ts
 */
async function main() {
  try {
    console.log("========================================================");
    console.log("⚠️  FIXING FILE PATH COLUMN NAMING");
    console.log("========================================================");
    
    console.log("Initializing database...");
    await setupDatabase();
    
    // First, check included_files table
    const hasPathColumn = await checkColumnExists('included_files', 'path');
    const hasFilePathColumn = await checkColumnExists('included_files', 'file_path');
    
    console.log(`Current columns in included_files: ${hasPathColumn ? 'path✅' : 'path❌'}, ${hasFilePathColumn ? 'file_path✅' : 'file_path❌'}`);
    console.log(`Current columns in excluded_files: ${await checkColumnExists('excluded_files', 'path') ? 'path✅' : 'path❌'}, ${await checkColumnExists('excluded_files', 'file_path') ? 'file_path✅' : 'file_path❌'}`);
    
    // Execute fixes based on what columns exist
    if (!hasPathColumn && hasFilePathColumn) {
      console.log("Fixing included_files table (renaming file_path to path)...");
      await fixIncludedFilesTable();
      
      console.log("Fixing excluded_files table (renaming file_path to path)...");
      await fixExcludedFilesTable();
    } else if (hasPathColumn && !hasFilePathColumn) {
      console.log("Tables already have the correct column name (path)");
    } else if (hasPathColumn && hasFilePathColumn) {
      console.log("Both column names exist, checking data consistency...");
      await consolidateColumns('included_files');
      await consolidateColumns('excluded_files');
    } else {
      console.log("Neither column exists, creating path column...");
      await createPathColumn('included_files');
      await createPathColumn('excluded_files');
    }
    
    console.log("\nVerifying fix...");
    console.log(`Final columns in included_files: ${await checkColumnExists('included_files', 'path') ? 'path✅' : 'path❌'}, ${await checkColumnExists('included_files', 'file_path') ? 'file_path✅' : 'file_path❌'}`);
    console.log(`Final columns in excluded_files: ${await checkColumnExists('excluded_files', 'path') ? 'path✅' : 'path❌'}, ${await checkColumnExists('excluded_files', 'file_path') ? 'file_path✅' : 'file_path❌'}`);
    
    console.log("\n✅ Column fix completed.");
    console.log("You can now start the application with: pnpm dev");
  } catch (error) {
    console.error("❌ ERROR fixing column names:", error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

// Helper function to check if a column exists in a table
async function checkColumnExists(table: string, column: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    db.get(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) {
        console.error(`Error checking ${column} in ${table}:`, err);
        reject(err);
        return;
      }
      
      // Check if the column exists in the result
      let columnExists = false;
      if (Array.isArray(rows)) {
        columnExists = rows.some(row => row.name === column);
      } else if (rows) {
        // Single row result
        columnExists = rows.name === column;
      }
      
      resolve(columnExists);
    });
  });
}

// Function to fix included_files table
async function fixIncludedFilesTable(): Promise<void> {
  try {
    // Create a new table with the correct column name
    await executeSQL(`
      CREATE TABLE included_files_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        path TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        UNIQUE(session_id, path)
      )
    `);
    
    // Copy data from the old table to the new one
    await executeSQL(`
      INSERT INTO included_files_new (id, session_id, path)
      SELECT id, session_id, file_path FROM included_files
    `);
    
    // Drop the old table
    await executeSQL(`DROP TABLE included_files`);
    
    // Rename the new table to the original name
    await executeSQL(`ALTER TABLE included_files_new RENAME TO included_files`);
    
    // Create index for better performance on lookups
    await executeSQL(`CREATE INDEX IF NOT EXISTS idx_included_files_session ON included_files(session_id)`);
    
    console.log("Successfully fixed included_files table");
  } catch (error) {
    console.error("Error fixing included_files table:", error);
    throw error;
  }
}

// Function to fix excluded_files table
async function fixExcludedFilesTable(): Promise<void> {
  try {
    // Create a new table with the correct column name
    await executeSQL(`
      CREATE TABLE excluded_files_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        path TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        UNIQUE(session_id, path)
      )
    `);
    
    // Copy data from the old table to the new one
    await executeSQL(`
      INSERT INTO excluded_files_new (id, session_id, path)
      SELECT id, session_id, file_path FROM excluded_files
    `);
    
    // Drop the old table
    await executeSQL(`DROP TABLE excluded_files`);
    
    // Rename the new table to the original name
    await executeSQL(`ALTER TABLE excluded_files_new RENAME TO excluded_files`);
    
    // Create index for better performance on lookups
    await executeSQL(`CREATE INDEX IF NOT EXISTS idx_excluded_files_session ON excluded_files(session_id)`);
    
    console.log("Successfully fixed excluded_files table");
  } catch (error) {
    console.error("Error fixing excluded_files table:", error);
    throw error;
  }
}

// Function to consolidate data when both columns exist
async function consolidateColumns(table: string): Promise<void> {
  try {
    // Update path with file_path values where path is null
    await executeSQL(`
      UPDATE ${table}
      SET path = file_path
      WHERE path IS NULL AND file_path IS NOT NULL
    `);
    
    // Update file_path with path values where file_path is null
    await executeSQL(`
      UPDATE ${table}
      SET file_path = path
      WHERE file_path IS NULL AND path IS NOT NULL
    `);
    
    // Check if we should keep both columns or remove file_path
    const result = await new Promise<{count: number}>((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM ${table} WHERE path <> file_path`, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row as {count: number});
      });
    });
    
    if (result.count === 0) {
      // Safe to drop file_path column as all values match
      // SQLite doesn't have DROP COLUMN until version 3.35.0, so we need to recreate the table
      const tableInfo = await getTableInfo(table);
      
      // Create new table without file_path column
      const createSQL = tableInfo
        .filter(col => col.name !== 'file_path')
        .map(col => {
          let def = `${col.name} ${col.type}`;
          if (col.pk === 1) def += ' PRIMARY KEY';
          if (col.notnull === 1) def += ' NOT NULL';
          if (col.dflt_value) def += ` DEFAULT ${col.dflt_value}`;
          return def;
        })
        .join(', ');
      
      await executeSQL(`
        CREATE TABLE ${table}_new (${createSQL})
      `);
      
      // Copy data to the new table
      const columnNames = tableInfo
        .filter(col => col.name !== 'file_path')
        .map(col => col.name)
        .join(', ');
      
      await executeSQL(`
        INSERT INTO ${table}_new (${columnNames})
        SELECT ${columnNames} FROM ${table}
      `);
      
      // Drop the old table and rename the new one
      await executeSQL(`DROP TABLE ${table}`);
      await executeSQL(`ALTER TABLE ${table}_new RENAME TO ${table}`);
      
      // Recreate index
      await executeSQL(`CREATE INDEX IF NOT EXISTS idx_${table}_session ON ${table}(session_id)`);
      
      console.log(`Removed redundant file_path column from ${table}`);
    } else {
      console.log(`Both path and file_path have different values in ${table}, keeping both for safety`);
    }
  } catch (error) {
    console.error(`Error consolidating columns in ${table}:`, error);
    throw error;
  }
}

// Function to create path column when neither exists
async function createPathColumn(table: string): Promise<void> {
  try {
    // SQLite doesn't support ADD COLUMN with constraints, so we need to recreate the table
    const tableInfo = await getTableInfo(table);
    
    // Create new table with path column
    const columnsWithoutPath = tableInfo.map(col => {
      let def = `${col.name} ${col.type}`;
      if (col.pk === 1) def += ' PRIMARY KEY';
      if (col.notnull === 1) def += ' NOT NULL';
      if (col.dflt_value) def += ` DEFAULT ${col.dflt_value}`;
      return def;
    }).join(', ');
    
    await executeSQL(`
      CREATE TABLE ${table}_new (
        ${columnsWithoutPath},
        path TEXT NOT NULL,
        UNIQUE(session_id, path)
      )
    `);
    
    // Copy data to the new table
    const columnNames = tableInfo.map(col => col.name).join(', ');
    
    await executeSQL(`
      INSERT INTO ${table}_new (${columnNames})
      SELECT ${columnNames} FROM ${table}
    `);
    
    // Drop the old table and rename the new one
    await executeSQL(`DROP TABLE ${table}`);
    await executeSQL(`ALTER TABLE ${table}_new RENAME TO ${table}`);
    
    // Recreate index
    await executeSQL(`CREATE INDEX IF NOT EXISTS idx_${table}_session ON ${table}(session_id)`);
    
    console.log(`Created path column in ${table}`);
  } catch (error) {
    console.error(`Error creating path column in ${table}:`, error);
    throw error;
  }
}

// Helper function to get table column info
async function getTableInfo(table: string): Promise<Array<{name: string, type: string, notnull: number, dflt_value: string|null, pk: number}>> {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

// Helper function to execute SQL statements
async function executeSQL(sql: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

// Run the function
main(); 