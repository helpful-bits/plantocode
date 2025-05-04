// Only run database setup on the server
const isServer = typeof window === 'undefined';

// Only import databases modules when on server
import { closeDatabase, connectionPool } from './index';
import { APP_DATA_DIR, DB_FILE } from './constants';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { validateDatabaseConnection } from './setup/validation';
import { runMigrations } from './setup/migrations';
import { 
  fixDatabasePermissions, 
  createMinimalDatabase, 
  logDatabaseError,
  resetDatabase as resetDatabaseImpl,
  getDatabaseInfo as getDatabaseInfoImpl
} from './setup/utils';

/**
 * Result of database setup operation
 */
export interface DBSetupResult {
  success: boolean;
  message: string;
  error?: string;
  recoveryMode?: boolean;
}

// For client-side code, return a dummy promise
function dummyPromise(): Promise<DBSetupResult> {
  return Promise.resolve({
    success: true,
    message: "Database operations are not available in the browser"
  });
}

// Global flag to track if database has been fully initialized this session
let databaseInitialized = false;
let lastPermissionsCheck = 0;
const PERMISSIONS_CHECK_INTERVAL = 60000; // 1 minute

// Setup lock to prevent concurrent setup attempts
let setupInProgress = false;
let setupPromise: Promise<DBSetupResult> | null = null;
let lastSetupTime = 0;
const SETUP_DEBOUNCE_MS = 5000; // Increase debounce to 5 seconds to avoid redundant setup operations

/**
 * Setup and initialize the database
 * Creates the database file if it doesn't exist and ensures it's usable
 */
export async function setupDatabase(forceRecoveryMode: boolean = false): Promise<DBSetupResult> {
  if (!isServer) return dummyPromise();
  
  // If database is already initialized and we're not forcing recovery mode, return fast
  if (databaseInitialized && !forceRecoveryMode) {
    // Skip verbose logging for most calls to reduce noise
    return {
      success: true,
      message: "Database already initialized"
    };
  }
  
  // Debounce rapid setup calls
  const now = Date.now();
  if (now - lastSetupTime < SETUP_DEBOUNCE_MS && setupPromise) {
    console.log("[Setup] Setup call debounced, reusing pending setup promise");
    return setupPromise;
  }
  
  // If setup is already in progress, return the existing promise
  if (setupInProgress && setupPromise) {
    console.log("[Setup] Setup already in progress, returning existing promise");
    return setupPromise;
  }
  
  // Set the lock and create a new setup promise
  setupInProgress = true;
  lastSetupTime = now;
  
  // Create the promise that will be returned or reused
  setupPromise = (async () => {
    console.log("[Setup] Setting up database:", DB_FILE);
    const setupStartTime = Date.now();
    
    try {
      // Ensure the app directory exists
      if (!fs.existsSync(APP_DATA_DIR)) {
        fs.mkdirSync(APP_DATA_DIR, { recursive: true });
      }
      
      // Only check permissions if enough time has passed since last check
      if (now - lastPermissionsCheck > PERMISSIONS_CHECK_INTERVAL || forceRecoveryMode) {
        await fixDatabasePermissions();
        lastPermissionsCheck = now;
      }
      
      // Check if database file exists
      const fileExists = fs.existsSync(DB_FILE);
      
      if (!fileExists) {
        console.log("[Setup] Database file doesn't exist, will create it");
      }
      
      // Try to connect and check the database condition
      if (forceRecoveryMode) {
        console.log("[Setup] Forced recovery mode enabled");
        await createMinimalDatabase();
        
        // Mark database as initialized even in recovery mode
        databaseInitialized = true;
        
        return {
          success: true,
          message: "Database initialized in recovery mode",
          recoveryMode: true
        };
      }
      
      // Test the database connection and structure
      const isValid = await validateDatabaseConnection();
      
      if (!isValid) {
        console.warn("[Setup] Database validation failed, creating minimal database");
        await createMinimalDatabase();
        
        // Mark database as initialized after recovery
        databaseInitialized = true;
        
        return {
          success: true,
          message: "Database initialized in recovery mode due to validation failure",
          recoveryMode: true
        };
      }
      
      // Run migrations to ensure schema is up to date
      await runMigrations();
      
      // Mark database as initialized for the rest of this session
      databaseInitialized = true;
      
      console.log(`[Setup] Database setup completed in ${Date.now() - setupStartTime}ms`);
      
      return {
        success: true,
        message: fileExists 
          ? "Connected to existing database"
          : "Created new database successfully"
      };
      
    } catch (error) {
      console.error("[Setup] Error setting up database:", error);
      
      // Log the error to the diagnostic log for troubleshooting
      try {
        await logDatabaseError(
          'setup_error',
          error instanceof Error ? error.message : String(error),
          error instanceof Error ? error.stack : undefined,
          `During setupDatabase(${forceRecoveryMode})`
        );
      } catch (logError) {
        console.error("[Setup] Failed to log database error:", logError);
      }
      
      // Try to create a minimal working database in recovery mode
      try {
        await createMinimalDatabase();
        
        // Mark database as initialized even after error recovery
        databaseInitialized = true;
        
        return {
          success: true,
          message: "Database initialized in recovery mode due to setup error",
          error: error instanceof Error ? error.message : String(error),
          recoveryMode: true
        };
      } catch (recoveryError) {
        return {
          success: false,
          message: "Failed to set up database, even in recovery mode",
          error: `Original error: ${error instanceof Error ? error.message : String(error)}\nRecovery error: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`
        };
      }
    } finally {
      // Release the lock
      setupInProgress = false;
    }
  })();
  
  return setupPromise;
}

/**
 * Export utility functions
 */
export async function resetDatabase(): Promise<void> {
  if (!isServer) return Promise.resolve();
  return resetDatabaseImpl();
}

/**
 * Get information about the database
 */
export async function getDatabaseInfo(): Promise<any> {
  if (!isServer) return Promise.resolve({ error: "Not available in browser" });
  return getDatabaseInfoImpl();
}
