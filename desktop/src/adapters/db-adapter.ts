/**
 * Database Adapter for Tauri
 * 
 * This adapter connects the core application's repository pattern
 * to Tauri's SQLite database through the plugin-sql interface.
 */

import Database from '@tauri-apps/plugin-sql';

// Cache the database instance
let dbInstance: Database | null = null;

/**
 * Interface for query results
 */
export interface QueryResult<T = any> {
  rows: T[];
  lastInsertId?: number;
  rowsAffected?: number;
}

/**
 * Get the database instance
 */
export const getDb = async (): Promise<Database> => {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:appdata.db');
  }
  return dbInstance;
};

/**
 * Execute a SQL query that modifies data
 */
export const executeQuery = async (
  sql: string, 
  params: any[] = []
): Promise<{lastInsertId: number, rowsAffected: number}> => {
  const db = await getDb();
  return db.execute(sql, params);
};

/**
 * Execute a SQL query that fetches data
 */
export const selectQuery = async <T = any>(
  sql: string, 
  params: any[] = []
): Promise<T[]> => {
  const db = await getDb();
  return db.select<T>(sql, params);
};

/**
 * Execute a transaction with multiple statements
 */
export const executeTransaction = async (
  operations: {sql: string, params?: any[]}[]
): Promise<void> => {
  const db = await getDb();
  
  // Begin transaction
  await db.execute('BEGIN TRANSACTION', []);
  
  try {
    for (const op of operations) {
      await db.execute(op.sql, op.params || []);
    }
    
    // Commit transaction
    await db.execute('COMMIT', []);
  } catch (error) {
    // Rollback on error
    await db.execute('ROLLBACK', []);
    throw error;
  }
};

/**
 * Check if a table exists in the database
 */
export const tableExists = async (tableName: string): Promise<boolean> => {
  const result = await selectQuery(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [tableName]
  );
  return result.length > 0;
};

