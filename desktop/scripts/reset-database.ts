#!/usr/bin/env node

import {
  backupDatabase,
  resetDatabase,
} from "../../core/lib/db/integrity-check";
import { closeDatabase } from "../../core/lib/db";
import { DB_FILE } from "../../core/lib/db/constants";
import readline from "node:readline";
import fs from "node:fs";

/**
 * Script to reset the database (WARNING: Deletes all data!)
 * Execute with: pnpm reset-db
 */
(async function main() {
  try {
    // Check if database file exists
    if (!fs.existsSync(DB_FILE)) {
      console.log(`Database file doesn't exist at: ${DB_FILE}`);
      console.log("No database to reset.");
      process.exit(0);
    }

    // Create command-line interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("WARNING: This will DELETE ALL DATA in your database!");
    console.log(`Database location: ${DB_FILE}`);

    // Confirm with the user
    rl.question(
      "Are you sure you want to proceed? (yes/no): ",
      async (answer) => {
        if (answer.toLowerCase() === "yes") {
          console.log("Creating backup before reset...");

          try {
            // Try to backup the database first
            const backupPath = await backupDatabase();
            console.log(`Backup created at: ${backupPath}`);
          } catch (backupError) {
            console.error("Failed to create backup:", backupError);
            console.log("Continuing with reset anyway...");
          }

          console.log("Resetting database...");
          await resetDatabase();
          console.log("Database has been reset successfully.");
        } else {
          console.log("Database reset cancelled.");
        }

        // Clean up
        rl.close();
        await closeDatabase();
        process.exit(0);
      }
    );
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
})();
