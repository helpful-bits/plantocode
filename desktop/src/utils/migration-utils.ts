/**
 * Utilities for database migration in the desktop app
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * Apply the consolidated SQL migration to the SQLite database
 * This uses the Tauri command to run the migration
 */
export async function applyConsolidatedMigration(): Promise<string> {
  try {
    const result = (await invoke("apply_consolidated_migration"));
    return String(result);
  } catch (error) {
    console.error("Error applying consolidated migration:", error);
    throw new Error(`Failed to apply migration: ${String(error)}`);
  }
}

/**
 * Migrate database if needed
 * Call this during app initialization
 */
export async function runMigrationsIfNeeded(): Promise<void> {
  try {
    // eslint-disable-next-line no-console
    console.log("Checking and applying database migrations if needed...");
    const result = await applyConsolidatedMigration();
    // eslint-disable-next-line no-console
    console.log("Migration check result:", result);
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  }
}
