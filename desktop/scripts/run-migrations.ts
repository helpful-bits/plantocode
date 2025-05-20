#!/usr/bin/env node

import { setupDatabase, runMigrations, closeDatabase } from "../../core/lib/db";

/**
 * Script to explicitly run database migrations
 *
 * ⚠️ IMPORTANT: Migrations MUST be run manually after app installation and updates!
 * The application will NOT run migrations automatically during startup.
 *
 * Execute with: pnpm migrate
 *
 * This approach prevents database locking issues, reduces startup time,
 * and ensures better error handling for schema changes.
 */
async function main() {
  try {
    console.log("========================================================");
    console.log("⚠️  RUNNING DATABASE MIGRATIONS MANUALLY");
    console.log("This MUST be done after installation and code updates!");
    console.log("Failure to run migrations will result in application errors.");
    console.log("========================================================");

    console.log("Initializing database...");
    await setupDatabase();

    console.log("Running migrations...");
    await runMigrations();

    console.log("✅ Migrations completed successfully.");
    console.log("You can now start the application with: pnpm dev");
  } catch (error) {
    console.error("❌ ERROR running migrations:", error);
    console.error(
      "\nThis must be fixed before the application can run correctly!"
    );
    console.log("\nTroubleshooting steps:");
    console.log("1. Run 'pnpm check-db' to diagnose database problems");
    console.log(
      "2. Run 'pnpm check-db:repair' to repair database structure (preserves data)"
    );
    console.log(
      "3. Run 'pnpm reset-db' as a last resort (WARNING: deletes all data!)"
    );
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

// Run the function
main();
