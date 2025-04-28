#!/usr/bin/env node

import { 
  checkDatabaseIntegrity, 
  recreateDatabaseStructure, 
  backupDatabase 
} from '../lib/db/integrity-check';
import { closeDatabase } from '../lib/db';
import { DB_FILE } from '../lib/db/connection-pool';
import path from 'path';
import os from 'os';
import fs from 'fs';

const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');

/**
 * Script to check database integrity and optionally repair it
 * Execute with: pnpm check-db [--repair]
 */
async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  const shouldRepair = args.includes('--repair');
  
  try {
    console.log("========================================================");
    console.log("DATABASE DIAGNOSTICS TOOL");
    console.log("========================================================");
    
    // Check if database exists
    if (!fs.existsSync(DB_FILE)) {
      console.log("❌ Database file does not exist:", DB_FILE);
      console.log("\nDatabase will be created when you run the application or use:");
      console.log("  pnpm migrate");
      return;
    }
    
    // Get database file info
    const dbStats = fs.statSync(DB_FILE);
    const dbSize = formatBytes(dbStats.size);
    const dbModified = dbStats.mtime.toISOString();
    
    console.log("📁 DATABASE INFORMATION:");
    console.log(`  Location: ${DB_FILE}`);
    console.log(`  Size: ${dbSize}`);
    console.log(`  Last modified: ${dbModified}`);
    
    // Check for WAL and SHM files
    const walFile = `${DB_FILE}-wal`;
    const shmFile = `${DB_FILE}-shm`;
    
    if (fs.existsSync(walFile)) {
      const walSize = formatBytes(fs.statSync(walFile).size);
      console.log(`  WAL file exists (${walSize})`);
    }
    
    if (fs.existsSync(shmFile)) {
      const shmSize = formatBytes(fs.statSync(shmFile).size);
      console.log(`  SHM file exists (${shmSize})`);
    }
    
    console.log("\n🔍 RUNNING INTEGRITY CHECK...");
    const integrityResult = await checkDatabaseIntegrity();
    
    if (integrityResult.isValid) {
      console.log("✅ Database integrity check PASSED");
    } else {
      console.log("❌ Database integrity check FAILED");
      console.log("\nErrors:");
      integrityResult.errors.forEach(error => {
        console.log(`  - ${error}`);
      });
      
      console.log("\nBackup Recommendation:");
      console.log("  It's recommended to create a backup before any repair operations");
      
      if (shouldRepair) {
        console.log("\n🔧 REPAIRING DATABASE...");
        console.log("  Creating backup first...");
        
        const backupPath = await backupDatabase();
        if (backupPath) {
          console.log(`  ✅ Backup created at: ${backupPath}`);
        } else {
          console.log("  ❌ Failed to create backup");
          process.exit(1);
        }
        
        console.log("  Repairing database structure...");
        const repairResult = await recreateDatabaseStructure();
        
        if (repairResult) {
          console.log("  ✅ Database structure repaired successfully");
          console.log("\n  Run 'pnpm migrate' to reapply migrations");
        } else {
          console.log("  ❌ Database repair failed");
          console.log("\n  Consider using 'pnpm reset-db' to reset the database completely");
        }
      } else {
        console.log("\nRepair Options:");
        console.log("  1. Run 'pnpm check-db --repair' to attempt repair");
        console.log("  2. Run 'pnpm reset-db' to reset the database (WARNING: deletes all data)");
      }
    }
    
    // Provide next steps
    console.log("\n📋 NEXT STEPS:");
    if (integrityResult.isValid) {
      console.log("  - Run 'pnpm migrate' to ensure schema is up to date");
      console.log("  - Start the application with 'pnpm dev'");
    } else if (!shouldRepair) {
      console.log("  - Run 'pnpm check-db --repair' to attempt repair");
    } else {
      console.log("  - Run 'pnpm migrate' to reapply migrations");
      console.log("  - Start the application with 'pnpm dev'");
    }
    
    console.log("\n========================================================");
  } catch (error) {
    console.error("Error running database check:", error);
    process.exit(1);
  } finally {
    // Close any open database connections
    closeDatabase();
  }
}

// Helper function to format bytes to human-readable size
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Run the function
main();