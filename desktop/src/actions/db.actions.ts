/**
 * Database Actions
 *
 * Direct actions for database operations using Tauri invoke commands
 * to the Rust backend.
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * Interface for query results
 */
export interface QueryResult<T = unknown> {
  rows: T[];
  lastInsertId?: number;
  rowsAffected?: number;
}

/**
 * Execute a SQL query that modifies data
 */
export async function executeQuery(
  sql: string,
  params: unknown[] = []
): Promise<{ lastInsertId: number; rowsAffected: number }> {
  return invoke("db_execute_query", { sql, params });
}

/**
 * Execute a SQL query that fetches data
 */
export async function selectQuery<T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  return invoke("db_select_query", { sql, params });
}

/**
 * Execute a transaction with multiple statements
 */
export async function executeTransaction(
  operations: { sql: string; params?: unknown[] }[]
): Promise<void> {
  return invoke("db_execute_transaction", { operations });
}

/**
 * Check if a table exists in the database
 */
export async function tableExists(tableName: string): Promise<boolean> {
  return invoke("db_table_exists", { tableName });
}
