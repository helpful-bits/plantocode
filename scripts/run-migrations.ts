#!/usr/bin/env node

import { setupDatabase, runMigrations, closeDatabase } from '../lib/db';

async function main() {
  try {
    console.log("Starting database migrations...");
    await setupDatabase();
    
    // Run migrations directly
    await runMigrations();
    
    console.log("Migrations completed successfully.");
  } catch (error) {
    console.error("Error running migrations:", error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

main(); 