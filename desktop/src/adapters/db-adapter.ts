/**
 * Database Adapter for Tauri
 * 
 * This adapter connects the core application's repository pattern
 * to Tauri's SQLite database through invoke commands to the Rust backend.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Interface for query results
 */
export interface QueryResult<T = any> {
  rows: T[];
  lastInsertId?: number;
  rowsAffected?: number;
}

/**
 * Execute a SQL query that modifies data
 */
export const executeQuery = async (
  sql: string, 
  params: any[] = []
): Promise<{lastInsertId: number, rowsAffected: number}> => {
  return invoke('db_execute_query', { sql, params });
};

/**
 * Execute a SQL query that fetches data
 */
export const selectQuery = async <T = any>(
  sql: string, 
  params: any[] = []
): Promise<T[]> => {
  return invoke('db_select_query', { sql, params });
};

/**
 * Execute a transaction with multiple statements
 */
export const executeTransaction = async (
  operations: {sql: string, params?: any[]}[]
): Promise<void> => {
  return invoke('db_execute_transaction', { operations });
};

/**
 * Check if a table exists in the database
 */
export const tableExists = async (tableName: string): Promise<boolean> => {
  return invoke('db_table_exists', { tableName });
};