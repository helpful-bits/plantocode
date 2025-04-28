#!/usr/bin/env node

import { setupDatabase, closeDatabase } from '../lib/db';
import { db } from '../lib/db/index';

/**
 * Script to fix data inconsistency between path and file_path columns
 * Execute with: npx tsx scripts/fix-column-data.ts
 */
async function main() {
  try {
    console.log("========================================================");
    console.log("🔄 SYNCHRONIZING PATH AND FILE_PATH COLUMNS");
    console.log("========================================================");
    
    console.log("Initializing database connection...");
    await setupDatabase();
    
    // Check if both columns exist in each table
    console.log("\nChecking included_files table...");
    await syncColumns('included_files');
    
    console.log("\nChecking excluded_files table...");
    await syncColumns('excluded_files');
    
    console.log("\n✅ Column data synchronization complete.");
    console.log("You can now start the application with: pnpm dev");
  } catch (error) {
    console.error("❌ ERROR during column synchronization:", error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

// Helper function to synchronize columns
async function syncColumns(table: string): Promise<void> {
  try {
    // Check if both columns exist
    const schema = await getTableInfo(table);
    const hasPathColumn = schema.some(col => col.name === 'path');
    const hasFilePathColumn = schema.some(col => col.name === 'file_path');
    
    console.log(`Table ${table}:`);
    console.log(`  - Has 'path' column: ${hasPathColumn ? 'Yes ✅' : 'No ❌'}`);
    console.log(`  - Has 'file_path' column: ${hasFilePathColumn ? 'Yes ✅' : 'No ❌'}`);
    
    if (!hasPathColumn || !hasFilePathColumn) {
      console.log(`  - ⚠️ Missing one of the columns, skipping synchronization`);
      return;
    }
    
    // Get count of rows where the columns have different values
    const differentCount = await getDifferentValuesCount(table);
    console.log(`  - Rows with different values: ${differentCount}`);
    
    if (differentCount > 0) {
      // Update path column with file_path values where path is NULL
      const pathNullCount = await updateNullValues(table, 'path', 'file_path');
      console.log(`  - Updated ${pathNullCount} NULL 'path' values with 'file_path' values`);
      
      // Update file_path column with path values where file_path is NULL
      const filePathNullCount = await updateNullValues(table, 'file_path', 'path');
      console.log(`  - Updated ${filePathNullCount} NULL 'file_path' values with 'path' values`);
      
      // Now check if there are still rows with different values
      const remainingDifferent = await getDifferentValuesCount(table);
      
      if (remainingDifferent > 0) {
        console.log(`  - ⚠️ There are still ${remainingDifferent} rows with different values`);
        console.log(`  - Synchronizing all values to use 'path' column as source of truth`);
        
        // Use path column as source of truth where both values exist but differ
        const updated = await executeSQL(`
          UPDATE ${table}
          SET file_path = path
          WHERE path IS NOT NULL AND file_path IS NOT NULL AND path <> file_path
        `);
        
        console.log(`  - Updated ${updated} rows to match 'path' values`);
      }
    } else {
      console.log(`  - ✅ All existing values are already synchronized`);
    }
    
    // Add NOT NULL constraint to both columns to ensure this doesn't happen again
    if (hasPathColumn && !schema.find(col => col.name === 'path')?.notnull) {
      console.log(`  - Adding NOT NULL constraint to 'path' column`);
      
      // SQLite doesn't support ALTER COLUMN, so we need to create a new table
      await executeSQL(`
        CREATE TABLE ${table}_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          path TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
          UNIQUE(session_id, path)
        );
        
        INSERT INTO ${table}_new SELECT * FROM ${table};
        
        DROP TABLE ${table};
        
        ALTER TABLE ${table}_new RENAME TO ${table};
        
        CREATE INDEX idx_${table}_session ON ${table}(session_id);
      `);
    }
    
    console.log(`  - ✅ Table ${table} is now synchronized and normalized`);
  } catch (error) {
    console.error(`Error synchronizing columns in ${table}:`, error);
    throw error;
  }
}

// Helper function to get count of rows where columns have different values
async function getDifferentValuesCount(table: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    db.get(`
      SELECT COUNT(*) as count FROM ${table}
      WHERE (path IS NULL AND file_path IS NOT NULL)
         OR (path IS NOT NULL AND file_path IS NULL)
         OR (path <> file_path)
    `, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      resolve(row.count);
    });
  });
}

// Helper function to update NULL values in one column with values from another
async function updateNullValues(table: string, targetCol: string, sourceCol: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    db.run(`
      UPDATE ${table}
      SET ${targetCol} = ${sourceCol}
      WHERE ${targetCol} IS NULL AND ${sourceCol} IS NOT NULL
    `, function(err) {
      if (err) {
        reject(err);
        return;
      }
      
      resolve(this.changes);
    });
  });
}

// Helper function to execute SQL statements
async function executeSQL(sql: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    db.exec(sql, function(err) {
      if (err) {
        reject(err);
        return;
      }
      
      // @ts-ignore - changes property exists on the db object
      resolve(this.changes || 0);
    });
  });
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

// Run the function
main(); 