import { initializeDatabase, closeDatabase } from './index';
import { Session } from '@/types/session-types';
import { OutputFormat } from '@/types';
import { sessionRepository } from './repository';
import { db } from './index';

/**
 * Initialize the database and migrate data from localStorage
 */
export async function setupDatabase() {
  // Initialize the database (runs migrations)
  initializeDatabase();
  
  // Verify database structure after initialization
  verifyDatabaseStructure();
  
  // Return the repository for further use
  return {
    sessionRepository,
  };
}

function verifyDatabaseStructure() {
  // Check if all expected tables exist
  const expectedTables = [
    'sessions', 
    'included_files', 
    'excluded_files', 
    'project_settings', 
    'cached_state_items',
    'migrations'
  ];
  
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error("Error verifying database structure:", err);
      return;
    }
    
    const existingTables = new Set(tables.map(t => t.name));
    const missingTables = expectedTables.filter(t => !existingTables.has(t));
    
    if (missingTables.length > 0) {
      console.warn(`Missing tables detected: ${missingTables.join(', ')}`);
      console.warn("The migrations should have created these tables. If issues persist, consider resetting the database.");
    } else {
      console.log("Database structure verification complete. All tables exist.");
    }
  });
}

/**
 * Migrate data from localStorage to SQLite
 * This is no longer needed but kept for backward compatibility
 * @param localStorageData Optional data from client-side localStorage
 */
export async function migrateFromLocalStorage(localStorageData?: Record<string, string>) {
  // Migration is no longer needed
  console.log('Migration from localStorage is no longer needed');
  return;
}

/**
 * Cleanup function to be called on application shutdown
 */
export function cleanupDatabase() {
  closeDatabase();
}

// Function to reset the database if needed
export function resetDatabase() {
  return new Promise<void>((resolve, reject) => {
    // Get list of all tables
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
      if (err) {
        console.error("Error getting tables for reset:", err);
        reject(err);
        return;
      }
      
      // Skip sqlite_sequence which is internal
      const tableNames = tables
        .map(t => t.name)
        .filter(name => name !== 'sqlite_sequence');
      
      if (tableNames.length === 0) {
        console.log("No tables to drop for reset");
        resolve();
        return;
      }
      
      // Drop all tables
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error("Error beginning transaction for database reset:", err);
          reject(err);
          return;
        }
        
        // Generate drop statements for all tables
        const dropPromises = tableNames.map(
          table => new Promise<void>((resolveTable, rejectTable) => {
            db.run(`DROP TABLE IF EXISTS ${table}`, (err) => {
              if (err) {
                console.error(`Error dropping table ${table}:`, err);
                rejectTable(err);
              } else {
                console.log(`Dropped table: ${table}`);
                resolveTable();
              }
            });
          })
        );
        
        // Wait for all tables to be dropped
        Promise.all(dropPromises)
          .then(() => {
            // Commit the transaction
            db.run('COMMIT', (err) => {
              if (err) {
                console.error("Error committing database reset:", err);
                db.run('ROLLBACK');
                reject(err);
                return;
              }
              
              console.log("Database reset complete. Re-initializing...");
              initializeDatabase();
              resolve();
            });
          })
          .catch(error => {
            console.error("Error during table drops:", error);
            db.run('ROLLBACK');
            reject(error);
          });
      });
    });
  });
}

export default setupDatabase; 