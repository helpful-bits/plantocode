#!/usr/bin/env node

import { setupDatabase, closeDatabase } from '../lib/db';
import connectionPool from '../lib/db/connection-pool';
import Database from 'better-sqlite3';

/**
 * Script to dump database tables and their structure for diagnostic purposes
 * Execute with: npx tsx scripts/dump-tables.ts
 */
async function main() {
  try {
    console.log("========================================================");
    console.log("📊 DATABASE SCHEMA DIAGNOSTIC");
    console.log("========================================================");
    
    console.log("Initializing database connection...");
    await setupDatabase();
    
    // Get list of all tables
    const tables = await listTables();
    console.log(`\nFound ${tables.length} tables: ${tables.join(', ')}`);
    
    // Examine each table
    for (const table of tables) {
      console.log(`\n📋 TABLE: ${table}`);
      
      // Get table schema
      const schema = await getTableInfo(table);
      console.log(`Schema: (${schema.length} columns)`);
      
      // Display each column and its properties
      schema.forEach(col => {
        console.log(`  - ${col.name} (${col.type})${col.pk ? ' PRIMARY KEY' : ''}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
      });
      
      // Count rows in the table
      const count = await getRowCount(table);
      console.log(`Row count: ${count}`);
      
      // If this is the included_files or excluded_files table, check for specific issues
      if (table === 'included_files' || table === 'excluded_files') {
        await diagnoseProblem(table, schema);
      }
    }
    
    console.log("\n========================================================");
    console.log("📊 DATABASE SCHEMA DIAGNOSTIC COMPLETE");
    console.log("========================================================");
  } catch (error: unknown) {
    console.error("❌ ERROR during database diagnostic:", error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

// Helper function to list all tables
async function listTables(): Promise<string[]> {
  return connectionPool.withConnection((db: Database.Database) => {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{name: string}>;
    return rows.map((row) => row.name);
  }, true);
}

// Helper function to get table column info
async function getTableInfo(table: string): Promise<Array<{name: string, type: string, notnull: number, dflt_value: string|null, pk: number}>> {
  return connectionPool.withConnection((db: Database.Database) => {
    return db.prepare(`PRAGMA table_info(${table})`).all() as Array<{name: string, type: string, notnull: number, dflt_value: string|null, pk: number}>;
  }, true);
}

// Helper function to get row count
async function getRowCount(table: string): Promise<number> {
  return connectionPool.withConnection((db: Database.Database) => {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as {count: number};
    return row.count;
  }, true);
}

// Helper function to diagnose specific problems
async function diagnoseProblem(table: string, schema: Array<{name: string, type: string, notnull: number, dflt_value: string|null, pk: number}>) {
  const hasPathColumn = schema.some(col => col.name === 'path');
  const hasFilePathColumn = schema.some(col => col.name === 'file_path');
  
  console.log(`\nDiagnostic for ${table}:`);
  console.log(`  - Has 'path' column: ${hasPathColumn ? 'Yes ✅' : 'No ❌'}`);
  console.log(`  - Has 'file_path' column: ${hasFilePathColumn ? 'Yes ✅' : 'No ❌'}`);
  
  // Check the query that's failing
  try {
    await connectionPool.withConnection((db: Database.Database) => {
      try {
        const rows = db.prepare(`SELECT id, session_id, path FROM ${table} LIMIT 5`).all();
        console.log(`  - 'SELECT path' query test: Success ✅ - Found ${rows.length} rows`);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.log(`  - 'SELECT path' query test: Failed ❌ - ${errorMessage}`);
      }
    }, true);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  - 'SELECT path' query test: Error - ${errorMessage}`);
  }
  
  // If both path and file_path queries fail, check the actual column names
  if (!hasPathColumn && !hasFilePathColumn) {
    try {
      await connectionPool.withConnection((db: Database.Database) => {
        try {
          // Get a single row to check column names
          const row = db.prepare(`SELECT * FROM ${table} LIMIT 1`).get();
          
          if (row) {
            console.log(`  - 'SELECT *' query test: Success ✅`);
            console.log(`  - Actual columns in first row: ${Object.keys(row).join(', ')}`);
          } else {
            console.log(`  - 'SELECT *' query test: No rows found`);
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.log(`  - 'SELECT *' query test: Failed ❌ - ${errorMessage}`);
        }
      }, true);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  - 'SELECT *' query test: Error - ${errorMessage}`);
    }
  }
}

// Run the function
main();