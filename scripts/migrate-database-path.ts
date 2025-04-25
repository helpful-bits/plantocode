import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

/**
 * This script migrates the database from the old location (.o1-pro-flow) to the new location (.ai-architect-studio)
 * 
 * Features:
 * - Checks if an old database exists and needs migration
 * - Creates a backup of the old database before migration
 * - Handles cases where the new database already exists
 * - Provides option to delete the old database after successful migration
 * 
 * Usage:
 * $ pnpm migrate-database-path
 */

const OLD_APP_DATA_DIR = path.join(os.homedir(), '.o1-pro-flow');
const OLD_DB_FILE = path.join(OLD_APP_DATA_DIR, 'o1-pro-flow.db');
const NEW_APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
const NEW_DB_FILE = path.join(NEW_APP_DATA_DIR, 'ai-architect-studio.db');

async function migrateDatabase() {
  console.log('=== Database Migration Utility ===');
  console.log(`This tool will migrate your database from ${OLD_DB_FILE} to ${NEW_DB_FILE}`);
  console.log('');

  // Check if the old database exists
  if (!fs.existsSync(OLD_DB_FILE)) {
    console.log('No old database found at the expected location.');
    console.log('No migration needed.');
    return;
  }

  // Create the new directory if it doesn't exist
  if (!fs.existsSync(NEW_APP_DATA_DIR)) {
    console.log(`Creating new data directory: ${NEW_APP_DATA_DIR}`);
    fs.mkdirSync(NEW_APP_DATA_DIR, { recursive: true });
  }

  // Check if the new database already exists
  if (fs.existsSync(NEW_DB_FILE)) {
    console.log('New database already exists. Checking if migration is still needed...');
    
    const oldStats = fs.statSync(OLD_DB_FILE);
    const newStats = fs.statSync(NEW_DB_FILE);
    
    // If the old db is newer or larger, we should migrate
    if (oldStats.mtimeMs > newStats.mtimeMs || oldStats.size > newStats.size) {
      console.log('Old database is newer or larger than existing new database.');
      console.log('Migration recommended to preserve newer data.');
      
      const confirmation = await promptUser('Continue with migration? (yes/no): ');
      if (confirmation.toLowerCase() !== 'yes') {
        console.log('Migration cancelled by user.');
        return;
      }
    } else {
      console.log('Existing new database appears up-to-date. No migration needed.');
      return;
    }
  }

  try {
    // Create a backup of the old database
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `${OLD_DB_FILE}.backup-${timestamp}`;
    console.log(`Creating backup of old database at: ${backupFile}`);
    fs.copyFileSync(OLD_DB_FILE, backupFile);
    console.log('Backup created successfully.');

    // Copy the database to the new location
    console.log(`Migrating database from ${OLD_DB_FILE} to ${NEW_DB_FILE}`);
    fs.copyFileSync(OLD_DB_FILE, NEW_DB_FILE);
    
    console.log('');
    console.log('✅ Database migration completed successfully!');
    console.log(`Your data is now stored in: ${NEW_DB_FILE}`);
    console.log(`A backup of your old database was created at: ${backupFile}`);
    
    // Ask if the user wants to delete the old database
    console.log('');
    const shouldDelete = await promptUser('Would you like to delete the old database? (yes/no): ');
    if (shouldDelete.toLowerCase() === 'yes') {
      try {
        fs.unlinkSync(OLD_DB_FILE);
        console.log('Old database deleted successfully.');
      } catch (error) {
        console.error('Failed to delete the old database:', error);
        console.log('You may need to manually delete it later.');
      }
    } else {
      console.log('Old database will not be deleted. You can manually delete it later if needed.');
    }
    
    console.log('');
    console.log('Migration process complete. Your application will now use the new database location.');
  } catch (error) {
    console.error('Error during database migration:', error);
    console.error('Migration failed. Please try again or contact support for assistance.');
    process.exit(1);
  }
}

// Helper function to prompt for user input
function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Run the migration
migrateDatabase()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 