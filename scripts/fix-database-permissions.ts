#!/usr/bin/env tsx

/**
 * Fix database permissions script
 * 
 * This script can be run manually to fix database permissions issues:
 * npx tsx scripts/fix-database-permissions.ts
 */

import { ensureDbPermissions, handleReadonlyDatabase } from '../lib/db/connection-manager';
import { closeDatabase, initializeDatabase } from '../lib/db/index';
import { DB_FILE } from '../lib/db/constants';
import fs from 'fs';

async function main() {
  console.log("=== Database Permission Fix Utility ===");
  console.log(`Database location: ${DB_FILE}`);
  
  try {
    // Check if the database file exists
    const dbExists = fs.existsSync(DB_FILE);
    console.log(`Database file exists: ${dbExists ? 'Yes' : 'No'}`);
    
    if (dbExists) {
      // Check current permissions
      try {
        const stats = fs.statSync(DB_FILE);
        console.log(`Current database file mode: ${stats.mode.toString(8)}`);
      } catch (err) {
        console.error("Error checking database file stats:", err);
      }
    }
    
    // Step 1: Fix permissions
    console.log("\nStep 1: Fixing permissions...");
    const permissionsFixed = await ensureDbPermissions();
    
    if (permissionsFixed) {
      console.log("✅ Database permissions successfully fixed");
    } else {
      console.error("❌ Failed to fix database permissions");
    }
    
    // Step 2: Handle readonly database issues
    console.log("\nStep 2: Handling readonly database issues...");
    const readonlyFixed = await handleReadonlyDatabase();
    
    if (readonlyFixed) {
      console.log("✅ Readonly database issues successfully fixed");
    } else {
      console.error("❌ Failed to fix readonly database issues");
    }
    
    // Step 3: Verify database can be initialized
    console.log("\nStep 3: Verifying database initialization...");
    const initialized = await initializeDatabase(true); // Force recovery mode
    
    if (initialized) {
      console.log("✅ Database successfully initialized");
    } else {
      console.error("❌ Failed to initialize database");
    }
    
    console.log("\nSummary:");
    console.log(`Permissions fixed: ${permissionsFixed ? 'Yes' : 'No'}`);
    console.log(`Readonly issues fixed: ${readonlyFixed ? 'Yes' : 'No'}`);
    console.log(`Database initialized: ${initialized ? 'Yes' : 'No'}`);
    
    // Final result
    if (permissionsFixed && readonlyFixed && initialized) {
      console.log("\n✅ All database issues have been resolved successfully!");
    } else {
      console.error("\n⚠️ Some database issues could not be resolved.");
      console.log("You may need to manually delete the database file and let the application recreate it:");
      console.log(`rm "${DB_FILE}"`);
    }
  } catch (error) {
    console.error("Error fixing database permissions:", error);
  } finally {
    // Clean up
    closeDatabase();
  }
}

// Run the main function
main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
}); 