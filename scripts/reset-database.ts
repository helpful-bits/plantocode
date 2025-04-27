#!/usr/bin/env node

import { backupDatabase, resetDatabase } from '../lib/db/integrity-check';
import { closeDatabase } from '../lib/db';
import readline from 'readline';
import path from 'path';
import os from 'os';
import fs from 'fs';

const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db');

/**
 * Script to reset the database (WARNING: Deletes all data!)
 * Execute with: pnpm reset-db
 */
async function main() {
  try {
    console.log("========================================================");
    console.log("⚠️  DATABASE RESET TOOL");
    console.log("========================================================");
    console.log("WARNING: This will delete ALL data in your database!");
    console.log("A backup will be created first, but all current data will be LOST");
    console.log("\nDatabase location:");
    console.log(`  ${DB_FILE}`);
    
    // Check if database exists
    if (!fs.existsSync(DB_FILE)) {
      console.log("\n❌ Database file does not exist, nothing to reset.");
      process.exit(0);
    }
    
    // Display size information
    const dbSize = formatBytes(fs.statSync(DB_FILE).size);
    console.log(`\nCurrent database size: ${dbSize}`);
    
    // Ask for confirmation
    const confirmed = await confirmAction("Are you sure you want to RESET the database? (yes/no) ");
    
    if (!confirmed) {
      console.log("\n❌ Reset cancelled.");
      process.exit(0);
    }
    
    console.log("\n🔄 Resetting database...");
    
    // Create backup
    console.log("  Creating backup...");
    const backupPath = await backupDatabase();
    
    if (!backupPath) {
      console.log("❌ Failed to create backup. Reset aborted.");
      process.exit(1);
    }
    
    console.log(`  ✅ Backup created at: ${backupPath}`);
    
    // Reset database
    console.log("  Resetting database...");
    const resetResult = await resetDatabase();
    
    if (resetResult) {
      console.log("  ✅ Database reset successfully");
      console.log("\nNext steps:");
      console.log("  1. Run 'pnpm migrate' to initialize the database schema");
      console.log("  2. Start the application with 'pnpm dev'");
    } else {
      console.log("  ❌ Database reset failed");
      console.log(`\nYou can manually delete the database file at ${DB_FILE} if needed.`);
      process.exit(1);
    }
    
    console.log("\n========================================================");
  } catch (error) {
    console.error("Error resetting database:", error);
    process.exit(1);
  } finally {
    // Close any open database connections
    closeDatabase();
  }
}

// Helper function to prompt for confirmation
function confirmAction(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      resolve(normalized === 'yes' || normalized === 'y');
    });
  });
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