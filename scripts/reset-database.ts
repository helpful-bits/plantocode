/**
 * This script allows users to reset the database if they encounter migration issues
 * It deletes the database file so a new one will be created on next startup
 * 
 * Usage:
 * - pnpm reset-db         # Interactive mode
 * - pnpm reset-db --yes   # Automatic mode: answer yes to all prompts
 */

import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { exec } from 'child_process';
import readline from 'readline';
import sqlite3 from 'sqlite3';

// Get the path to the AI Architect Studio directory in the user's home directory
const appDataDir = path.join(homedir(), '.ai-architect-studio');
const dbFilePath = path.join(appDataDir, 'ai-architect-studio.db');
const dbBackupDir = path.join(appDataDir, 'backups');

// Check if automatic mode is enabled
const args = process.argv.slice(2);
const autoMode = args.includes('--yes') || args.includes('-y');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Create a backup of the database file
 */
function backupDatabase(): string | null {
  try {
    if (!fs.existsSync(dbFilePath)) {
      console.log('No database file found to backup.');
      return null;
    }

    // Create backup directory if it doesn't exist
    if (!fs.existsSync(dbBackupDir)) {
      fs.mkdirSync(dbBackupDir, { recursive: true });
    }

    // Create a timestamp for the backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(dbBackupDir, `ai-architect-studio-${timestamp}.db.bak`);

    // Copy the database file to the backup location
    fs.copyFileSync(dbFilePath, backupPath);
    console.log(`Database backed up to: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('Error creating backup:', error);
    return null;
  }
}

/**
 * Delete the database file
 */
function deleteDatabase() {
  try {
    if (!fs.existsSync(dbFilePath)) {
      console.log('No database file found to delete.');
      return;
    }

    fs.unlinkSync(dbFilePath);
    console.log(`Database file deleted: ${dbFilePath}`);
    
    // Also remove WAL and SHM files if they exist
    const walFile = `${dbFilePath}-wal`;
    const shmFile = `${dbFilePath}-shm`;
    
    if (fs.existsSync(walFile)) {
      fs.unlinkSync(walFile);
      console.log(`Database WAL file deleted: ${walFile}`);
    }
    
    if (fs.existsSync(shmFile)) {
      fs.unlinkSync(shmFile);
      console.log(`Database SHM file deleted: ${shmFile}`);
    }
  } catch (error) {
    console.error('Error deleting database:', error);
  }
}

/**
 * Create a new database file and run migrations
 */
function runMigrations() {
  return new Promise<void>((resolve, reject) => {
    console.log('Running database migrations...');
    
    // Ensure the database directory exists
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
      console.log(`Created database directory: ${appDataDir}`);
    }
    
    // Create a new empty database file to ensure SQLite can open it
    try {
      // Create a new database connection directly
      const db = new sqlite3.Database(dbFilePath, (err) => {
        if (err) {
          console.error(`Failed to create new database: ${err.message}`);
          reject(err);
          return;
        }
        
        console.log(`Created new database file: ${dbFilePath}`);
        
        // Close the connection so other processes can use it
        db.close((closeErr) => {
          if (closeErr) {
            console.error(`Error closing database: ${closeErr.message}`);
          }
          
          // Now run the migrations using the project's migration script
          exec('pnpm migrate', (error, stdout, stderr) => {
            if (error) {
              console.error(`Error running migrations: ${error.message}`);
              reject(error);
              return;
            }
            if (stderr) {
              console.warn(`Migration warnings: ${stderr}`);
            }
            console.log(stdout);
            console.log('Migrations completed successfully.');
            resolve();
          });
        });
      });
    } catch (error) {
      console.error(`Failed during database initialization: ${error}`);
      reject(error);
    }
  });
}

/**
 * Start the application
 */
function startApp() {
  console.log('Starting the application...');
  exec('pnpm dev', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error starting application: ${error.message}`);
      return;
    }
    console.log(stdout);
  });
}

/**
 * Main function to handle the database reset process
 */
function resetDatabase() {
  console.log('This utility will reset your AI Architect Studio database.');
  console.log('This is useful if you are experiencing database migration errors.');
  console.log('A backup will be created before deletion.');
  console.log('');
  console.log('WARNING: This will delete your saved sessions and preferences.');
  
  if (autoMode) {
    // In automatic mode, proceed with all steps
    console.log('Auto mode: Proceeding with database reset...');
    const backupPath = backupDatabase();
    if (backupPath) {
      console.log('Backup created successfully.');
    }

    deleteDatabase();
    console.log('');
    console.log('Database reset complete. The next time you start the application,');
    console.log('a new database will be created with fresh migrations.');
    
    console.log('Auto mode: Running migrations...');
    runMigrations()
      .then(() => {
        console.log('Auto mode: Starting application...');
        startApp();
      })
      .catch((error) => {
        console.error(`Database migration failed: ${error instanceof Error ? error.message : error}`);
        console.log('Auto mode: Starting application despite migration error...');
        startApp();
      });
    return;
  }
  
  // Interactive mode
  rl.question('Do you want to continue? (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      const backupPath = backupDatabase();
      if (backupPath) {
        console.log('Backup created successfully.');
      }

      deleteDatabase();
      console.log('');
      console.log('Database reset complete. The next time you start the application,');
      console.log('a new database will be created with fresh migrations.');
      
      // Ask if user wants to run migrations directly
      rl.question('Would you like to run migrations now? (yes/no): ', async (migrateAnswer) => {
        if (migrateAnswer.toLowerCase() === 'yes' || migrateAnswer.toLowerCase() === 'y') {
          try {
            await runMigrations();
            console.log('Database is ready to use.');
            
            // Now ask about restarting the application
            askToRestartApp();
          } catch (error) {
            console.error(`Failed to run migrations: ${error.message || error}`);
            askToRestartApp();
          }
        } else {
          askToRestartApp();
        }
      });
    } else {
      console.log('Database reset cancelled.');
      rl.close();
    }
  });
}

/**
 * Helper function to ask about restarting the app
 */
function askToRestartApp() {
  rl.question('Do you want to restart the application now? (yes/no): ', (restartAnswer) => {
    if (restartAnswer.toLowerCase() === 'yes' || restartAnswer.toLowerCase() === 'y') {
      startApp();
    } else {
      console.log('Please restart the application manually when ready.');
    }
    rl.close();
  });
}

// Run the reset function
resetDatabase(); 