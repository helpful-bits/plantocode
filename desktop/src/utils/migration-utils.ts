/**
 * Utilities for database migration in the desktop app
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Apply the consolidated SQL migration to the SQLite database
 * This uses the Tauri command to run the migration
 */
export async function applyConsolidatedMigration(): Promise<string> {
  try {
    const result = await invoke('apply_consolidated_migration') as string;
    return result;
  } catch (error) {
    console.error('Error applying consolidated migration:', error);
    throw new Error(`Failed to apply migration: ${error}`);
  }
}

/**
 * Migrate database if needed
 * Call this during app initialization
 */
export async function runMigrationsIfNeeded(): Promise<void> {
  try {
    console.log('Checking and applying database migrations if needed...');
    const result = await applyConsolidatedMigration();
    console.log('Migration check result:', result);
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}